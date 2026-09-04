"""Game rules: what bites, how big it is, and how the fight plays out.

Every function here takes an explicit ``random.Random`` so a seeded game is
fully reproducible (which is what the tests rely on).
"""

from dataclasses import dataclass, field

from . import catalog

# Player actions during a fight.
REEL = "recoger"
GIVE = "soltar"
HOLD = "aguantar"
ACTIONS = (REEL, GIVE, HOLD)

# What the fish is doing this round.
SURGE = "embestida"
SWIM = "nada"
REST = "descansa"

#: A fight that runs longer than this ends with the hook slipping.
MAX_ROUNDS = 14

#: Fraction of the tension the line sheds at the end of every round.
LINE_RECOVERY = 0.18


def rarity_weights(spot_key, bait):
    """Return the rarity weights in effect at a spot with a given bait.

    ``bait`` may be ``None`` (fishing bare-hooked), which makes junk and
    common fish noticeably more likely.
    """
    mods = dict(catalog.SPOT_RARITY_MODS.get(spot_key, {}))
    weights = {}
    for rarity, base in catalog.BASE_RARITY_WEIGHTS.items():
        weight = base * mods.get(rarity, 1.0)
        if bait is None:
            weight *= 1.6 if rarity in (catalog.JUNK, catalog.COMMON) else 0.7
        else:
            weight *= bait.rarity_mods.get(rarity, 1.0)
        weights[rarity] = weight
    return weights


def pick_species(rng, spot_key, bait=None):
    """Choose which species bites at ``spot_key``.

    Rarity is rolled first, then a species of that rarity is drawn uniformly.
    Rarities the spot has no species for are skipped.
    """
    available = catalog.species_in(spot_key)
    if not available:
        raise ValueError("no hay especies en %r" % spot_key)

    by_rarity = {}
    for species in available:
        by_rarity.setdefault(species.rarity, []).append(species)

    weights = rarity_weights(spot_key, bait)
    rarities = [r for r in by_rarity if weights.get(r, 0) > 0]
    picked = rng.choices(rarities, weights=[weights[r] for r in rarities])[0]
    return rng.choice(sorted(by_rarity[picked], key=lambda s: s.key))


def roll_weight(rng, species):
    """Roll a weight for ``species``, skewed towards the small end."""
    spread = species.max_weight - species.min_weight
    mode = species.min_weight + spread * 0.25
    weight = rng.triangular(species.min_weight, species.max_weight, mode)
    return round(weight, 2)


def price_of(species, weight):
    """Return what a catch sells for, rounded to whole coins."""
    if species.is_junk:
        return 0
    return max(1, int(round(species.price_per_kg * weight)))


def bite_delay(rng, bait=None):
    """Seconds of waiting before the fish bites. Bait does not rush it."""
    return rng.uniform(1.6, 6.5)


def reaction_window(species, bait=None):
    """Seconds the player gets to strike once the fish bites."""
    window = species.bite_window
    if bait is not None:
        window *= bait.patience
    return round(window, 2)


@dataclass
class Fish:
    """A hooked fish, mid-fight."""

    species: catalog.Species
    weight: float
    stamina: float
    max_stamina: float
    distance: float
    behaviour: str = SWIM

    @property
    def weight_ratio(self):
        """Where this fish sits between the species' min and max weight."""
        spread = self.species.max_weight - self.species.min_weight
        if spread <= 0:
            return 0.5
        return (self.weight - self.species.min_weight) / spread

    @property
    def is_exhausted(self):
        return self.stamina <= 0

    def pull(self):
        """How hard the fish is pulling this round."""
        base = self.species.fight * 0.85 * (0.75 + 0.5 * self.weight_ratio)
        multiplier = {SURGE: 1.7, SWIM: 1.0, REST: 0.3}[self.behaviour]
        if self.is_exhausted:
            multiplier *= 0.35
        return base * multiplier


def hook(rng, species, weight):
    """Build the :class:`Fish` that the player has to land."""
    stamina = species.fight * 9.0 + weight * 0.35
    distance = 8.0 + species.fight * 1.5
    return Fish(
        species=species,
        weight=weight,
        stamina=stamina,
        max_stamina=stamina,
        distance=round(distance, 1),
        behaviour=SWIM,
    )


def next_behaviour(rng, fish):
    """Pick what the fish does next. Tired fish surge far less."""
    if fish.is_exhausted:
        return rng.choices([SURGE, SWIM, REST], weights=[1, 3, 6])[0]
    energy = fish.stamina / fish.max_stamina
    return rng.choices([SURGE, SWIM, REST], weights=[2 + 5 * energy, 4, 1 + 2 * (1 - energy)])[0]


# Fight outcomes.
ONGOING = "en_curso"
LANDED = "cobrado"
SNAPPED = "sedal_roto"
ESCAPED = "escapado"


@dataclass
class Fight:
    """The tension/stamina tug of war between a rod and a hooked fish.

    The player reels to close the distance, which loads the line; giving line
    sheds tension but lets the fish recover. Land the fish before the line
    snaps or the hook slips.
    """

    fish: Fish
    rod: catalog.Rod
    rng: object
    tension: float = 0.0
    round_number: int = 0
    result: str = ONGOING
    log: list = field(default_factory=list)

    @property
    def tension_ratio(self):
        return min(1.0, self.tension / self.rod.line)

    def is_over(self):
        return self.result != ONGOING

    def play(self, action):
        """Apply one player action and let the fish respond.

        Returns the new result, one of ``ONGOING``, ``LANDED``, ``SNAPPED``
        or ``ESCAPED``.
        """
        if self.is_over():
            raise RuntimeError("el combate ya termino")
        if action not in ACTIONS:
            raise ValueError("accion desconocida: %r" % action)

        fish = self.fish
        self.round_number += 1
        pull = fish.pull()

        if action == REEL:
            gain = self.rod.power * {SURGE: 0.35, SWIM: 1.0, REST: 1.45}[fish.behaviour]
            if fish.is_exhausted:
                gain *= 1.5
            fish.distance -= gain
            self.tension += pull * 1.05
            fish.stamina -= pull * 1.1
        elif action == GIVE:
            self.tension -= self.rod.line * 0.4
            fish.distance += pull * 0.22
            fish.stamina -= pull * 0.25
            if fish.behaviour == REST:
                fish.stamina += fish.max_stamina * 0.08
        else:  # HOLD
            self.tension += max(0.0, pull - self.rod.power * 0.55) * 0.75
            fish.stamina -= pull * 0.75

        self.tension = max(0.0, self.tension)
        fish.distance = max(0.0, round(fish.distance, 2))
        fish.stamina = round(min(fish.stamina, fish.max_stamina), 2)

        if self.tension >= self.rod.line:
            self.result = SNAPPED
        elif fish.distance <= 0:
            self.result = LANDED
        elif self.round_number >= MAX_ROUNDS:
            self.result = ESCAPED
        else:
            self.tension = round(self.tension * (1 - LINE_RECOVERY), 3)
            fish.behaviour = next_behaviour(self.rng, fish)

        self.log.append((self.round_number, action, round(self.tension, 1), fish.distance))
        return self.result
