"""Static game data: species, spots, rods and baits.

Everything in this module is immutable data. The rules that use it live in
``engine.py`` so the two can be tested separately.
"""

from dataclasses import dataclass

COMMON = "comun"
RARE = "raro"
EPIC = "epico"
LEGENDARY = "legendario"
JUNK = "basura"

#: Base chance of each rarity showing up, before spot and bait modifiers.
BASE_RARITY_WEIGHTS = {
    JUNK: 10.0,
    COMMON: 60.0,
    RARE: 22.0,
    EPIC: 7.0,
    LEGENDARY: 1.0,
}

RARITY_LABELS = {
    JUNK: "basura",
    COMMON: "comun",
    RARE: "RARO",
    EPIC: "EPICO",
    LEGENDARY: "LEGENDARIO",
}


@dataclass(frozen=True)
class Species:
    """A fish (or piece of junk) that can be hooked.

    ``fight`` is a 1-10 difficulty rating: it drives how hard the fish pulls,
    how much stamina it has and how far away it starts.
    """

    key: str
    name: str
    rarity: str
    spot: str
    min_weight: float
    max_weight: float
    price_per_kg: int
    fight: int
    bite_window: float  # seconds the player has to react to the bite

    @property
    def is_junk(self):
        return self.rarity == JUNK


@dataclass(frozen=True)
class Spot:
    """A fishing location. ``price`` is what it costs to unlock."""

    key: str
    name: str
    description: str
    price: int


@dataclass(frozen=True)
class Rod:
    """A rod. ``power`` is metres reeled per pull, ``line`` is max tension."""

    key: str
    name: str
    power: float
    line: float
    price: int


@dataclass(frozen=True)
class Bait:
    """Consumable bait. ``rarity_mods`` multiplies the rarity weights."""

    key: str
    name: str
    price: int
    rarity_mods: dict
    patience: float  # multiplies the reaction window on the bite


SPOTS = {
    spot.key: spot
    for spot in (
        Spot("lago", "Lago Sereno", "Aguas tranquilas para empezar.", 0),
        Spot("rio", "Rio Bravo", "Corriente fuerte y peces con caracter.", 150),
        Spot("muelle", "Muelle Viejo", "Agua salada, capturas mas valiosas.", 500),
        Spot("mar", "Mar Abierto", "Solo con una buena cana.", 1800),
        Spot("abismo", "El Abismo", "Nadie ha vuelto con las manos vacias.", 6000),
    )
}

SPECIES = {
    species.key: species
    for species in (
        # -- Lago Sereno ------------------------------------------------
        Species("bota", "Bota vieja", JUNK, "lago", 0.4, 1.2, 0, 1, 2.2),
        Species("lata", "Lata oxidada", JUNK, "lago", 0.1, 0.4, 0, 1, 2.2),
        Species("carpa", "Carpa", COMMON, "lago", 0.8, 4.0, 6, 2, 2.0),
        Species("perca", "Perca", COMMON, "lago", 0.3, 1.5, 8, 2, 1.8),
        Species("trucha", "Trucha arcoiris", COMMON, "lago", 0.5, 2.5, 11, 3, 1.6),
        Species("anguila", "Anguila", RARE, "lago", 1.0, 3.5, 24, 4, 1.4),
        Species("lucio", "Lucio", RARE, "lago", 2.0, 9.0, 20, 4, 1.4),
        Species("siluro", "Siluro", EPIC, "lago", 15.0, 60.0, 26, 5, 1.2),
        Species("carpa_dorada", "Carpa dorada", LEGENDARY, "lago", 3.0, 12.0, 190, 5, 1.0),
        # -- Rio Bravo --------------------------------------------------
        Species("rama", "Rama empapada", JUNK, "rio", 0.5, 2.0, 0, 1, 2.2),
        Species("barbo", "Barbo", COMMON, "rio", 0.6, 3.0, 14, 3, 1.7),
        Species("cangrejo", "Cangrejo de rio", COMMON, "rio", 0.1, 0.5, 30, 2, 1.5),
        Species("trucha_marron", "Trucha marron", COMMON, "rio", 1.0, 4.5, 18, 4, 1.5),
        Species("salmon", "Salmon", RARE, "rio", 3.0, 12.0, 32, 5, 1.3),
        Species("esturion", "Esturion", EPIC, "rio", 20.0, 90.0, 38, 6, 1.1),
        Species("salmon_plateado", "Salmon plateado", LEGENDARY, "rio", 8.0, 20.0, 240, 6, 0.9),
        # -- Muelle Viejo -----------------------------------------------
        Species("red", "Red rota", JUNK, "muelle", 1.0, 4.0, 0, 1, 2.2),
        Species("sardina", "Sardina", COMMON, "muelle", 0.05, 0.3, 40, 1, 1.6),
        Species("caballa", "Caballa", COMMON, "muelle", 0.4, 2.0, 34, 3, 1.5),
        Species("dorada", "Dorada", COMMON, "muelle", 0.8, 4.0, 42, 4, 1.4),
        Species("lubina", "Lubina", RARE, "muelle", 1.5, 8.0, 55, 5, 1.3),
        Species("pulpo", "Pulpo", RARE, "muelle", 2.0, 10.0, 60, 6, 1.2),
        Species("congrio", "Congrio", EPIC, "muelle", 10.0, 40.0, 70, 7, 1.1),
        Species("mero_gigante", "Mero gigante", LEGENDARY, "muelle", 40.0, 120.0, 300, 8, 0.9),
        # -- Mar Abierto ------------------------------------------------
        Species("boya", "Boya perdida", JUNK, "mar", 2.0, 6.0, 0, 1, 2.2),
        Species("caballa_real", "Caballa real", COMMON, "mar", 2.0, 9.0, 70, 4, 1.4),
        Species("dorado", "Dorado", COMMON, "mar", 4.0, 18.0, 85, 5, 1.3),
        Species("raya", "Raya", RARE, "mar", 15.0, 60.0, 95, 6, 1.2),
        Species("atun", "Atun rojo", EPIC, "mar", 60.0, 250.0, 130, 8, 1.0),
        Species("pez_espada", "Pez espada", EPIC, "mar", 50.0, 200.0, 150, 9, 0.9),
        Species("tiburon", "Tiburon azul", LEGENDARY, "mar", 80.0, 260.0, 420, 9, 0.8),
        # -- El Abismo --------------------------------------------------
        Species("ancla", "Ancla oxidada", JUNK, "abismo", 20.0, 80.0, 0, 2, 2.2),
        Species("linterna", "Pez linterna", COMMON, "abismo", 0.2, 1.0, 220, 6, 1.3),
        Species("pez_vibora", "Pez vibora", COMMON, "abismo", 0.5, 2.0, 260, 6, 1.2),
        Species("calamar", "Calamar gigante", RARE, "abismo", 50.0, 220.0, 300, 8, 1.1),
        Species("pez_remo", "Pez remo", EPIC, "abismo", 40.0, 180.0, 380, 9, 0.9),
        Species("celacanto", "Celacanto", EPIC, "abismo", 30.0, 90.0, 500, 8, 0.9),
        Species("leviatan", "Leviatan", LEGENDARY, "abismo", 300.0, 900.0, 900, 10, 0.7),
    )
}

RODS = {
    rod.key: rod
    for rod in (
        Rod("bambu", "Cana de bambu", 2.4, 13.0, 0),
        Rod("fibra", "Cana de fibra", 3.0, 17.0, 260),
        Rod("carbono", "Cana de carbono", 4.0, 24.0, 1200),
        Rod("titanio", "Cana de titanio", 5.2, 33.0, 4500),
    )
}

#: Rod order, cheapest first. Used for the shop and for upgrade checks.
ROD_ORDER = ("bambu", "fibra", "carbono", "titanio")

BAITS = {
    bait.key: bait
    for bait in (
        Bait("lombriz", "Lombriz", 4, {JUNK: 0.5, COMMON: 1.0, RARE: 1.3}, 1.15),
        Bait("gusano", "Gusano rojo", 14, {JUNK: 0.3, COMMON: 0.9, RARE: 2.0}, 1.2),
        Bait("sardina_viva", "Sardina viva", 45, {JUNK: 0.2, COMMON: 0.6, RARE: 1.6, EPIC: 2.6}, 1.25),
        Bait("senuelo", "Senuelo brillante", 110, {JUNK: 0.1, COMMON: 0.4, RARE: 1.4, EPIC: 3.0, LEGENDARY: 3.0}, 1.3),
        Bait("cebo_magico", "Cebo magico", 320, {JUNK: 0.0, COMMON: 0.15, RARE: 1.0, EPIC: 3.0, LEGENDARY: 9.0}, 1.4),
    )
}

BAIT_ORDER = ("lombriz", "gusano", "sardina_viva", "senuelo", "cebo_magico")

#: Extra rarity pressure applied by the spot itself: deeper water, better fish.
SPOT_RARITY_MODS = {
    "lago": {},
    "rio": {COMMON: 0.95, RARE: 1.1},
    "muelle": {COMMON: 0.9, RARE: 1.2, EPIC: 1.2},
    "mar": {COMMON: 0.8, RARE: 1.3, EPIC: 1.5, LEGENDARY: 1.5},
    "abismo": {COMMON: 0.7, RARE: 1.4, EPIC: 1.8, LEGENDARY: 2.5},
}


def species_in(spot_key):
    """Return every species that can be hooked at ``spot_key``."""
    return [s for s in SPECIES.values() if s.spot == spot_key]
