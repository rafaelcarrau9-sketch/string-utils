"""Player state: money, gear, cooler, bestiary — and saving it to disk."""

import json
import os
import tempfile
from dataclasses import dataclass, field, asdict
from pathlib import Path

from . import catalog

SAVE_VERSION = 1
DEFAULT_SAVE_PATH = Path.home() / ".pesca" / "partida.json"

#: How many fish fit in the cooler before the player has to sell.
COOLER_CAPACITY = 8

STARTING_COINS = 30


class SaveError(Exception):
    """Raised when a save file exists but cannot be used."""


@dataclass
class Record:
    """Bestiary entry for one species."""

    caught: int = 0
    best_weight: float = 0.0


@dataclass
class Catch:
    """A fish sitting in the cooler, waiting to be sold."""

    species_key: str
    weight: float

    @property
    def species(self):
        return catalog.SPECIES[self.species_key]

    @property
    def price(self):
        from .engine import price_of

        return price_of(self.species, self.weight)


@dataclass
class GameState:
    """Everything about a player's progress."""

    coins: int = STARTING_COINS
    rod_key: str = "bambu"
    spot_key: str = "lago"
    unlocked_spots: list = field(default_factory=lambda: ["lago"])
    baits: dict = field(default_factory=dict)
    cooler: list = field(default_factory=list)
    records: dict = field(default_factory=dict)
    casts: int = 0
    landed: int = 0
    lost: int = 0
    best_sale: int = 0

    # -- convenience -----------------------------------------------------
    @property
    def rod(self):
        return catalog.RODS[self.rod_key]

    @property
    def spot(self):
        return catalog.SPOTS[self.spot_key]

    @property
    def cooler_is_full(self):
        return len(self.cooler) >= COOLER_CAPACITY

    @property
    def cooler_value(self):
        return sum(c.price for c in self.cooler)

    def bait_count(self, bait_key):
        return self.baits.get(bait_key, 0)

    def owned_baits(self):
        """Bait keys the player actually has, in catalog order."""
        return [k for k in catalog.BAIT_ORDER if self.baits.get(k, 0) > 0]

    def completion(self):
        """Return ``(species_found, species_total)`` for the bestiary."""
        total = len(catalog.SPECIES)
        found = sum(1 for r in self.records.values() if r.caught > 0)
        return found, total

    # -- mutations -------------------------------------------------------
    def use_bait(self, bait_key):
        """Consume one unit of bait. Returns the :class:`Bait` used."""
        if self.baits.get(bait_key, 0) <= 0:
            raise ValueError("no queda cebo %r" % bait_key)
        self.baits[bait_key] -= 1
        if self.baits[bait_key] == 0:
            del self.baits[bait_key]
        return catalog.BAITS[bait_key]

    def record_catch(self, species, weight):
        """Log a catch in the bestiary and put it in the cooler if sellable.

        Junk is recorded but thrown back, so it never eats cooler space.
        Returns ``True`` when the catch went into the cooler.
        """
        record = self.records.setdefault(species.key, Record())
        record.caught += 1
        record.best_weight = max(record.best_weight, weight)
        self.landed += 1
        if species.is_junk:
            return False
        self.cooler.append(Catch(species.key, weight))
        return True

    def sell_cooler(self):
        """Sell everything in the cooler. Returns the coins earned."""
        earned = self.cooler_value
        self.coins += earned
        self.cooler = []
        self.best_sale = max(self.best_sale, earned)
        return earned

    def buy_rod(self, rod_key):
        rod = catalog.RODS[rod_key]
        if catalog.ROD_ORDER.index(rod_key) <= catalog.ROD_ORDER.index(self.rod_key):
            raise ValueError("ya tienes una cana igual o mejor")
        if self.coins < rod.price:
            raise ValueError("no te llega el dinero")
        self.coins -= rod.price
        self.rod_key = rod_key
        return rod

    def buy_bait(self, bait_key, amount):
        bait = catalog.BAITS[bait_key]
        cost = bait.price * amount
        if amount <= 0:
            raise ValueError("cantidad invalida")
        if self.coins < cost:
            raise ValueError("no te llega el dinero")
        self.coins -= cost
        self.baits[bait_key] = self.baits.get(bait_key, 0) + amount
        return cost

    def unlock_spot(self, spot_key):
        spot = catalog.SPOTS[spot_key]
        if spot_key in self.unlocked_spots:
            raise ValueError("ya tienes acceso a esa zona")
        if self.coins < spot.price:
            raise ValueError("no te llega el dinero")
        self.coins -= spot.price
        self.unlocked_spots.append(spot_key)
        return spot

    # -- persistence -----------------------------------------------------
    def to_dict(self):
        return {
            "version": SAVE_VERSION,
            "coins": self.coins,
            "rod_key": self.rod_key,
            "spot_key": self.spot_key,
            "unlocked_spots": list(self.unlocked_spots),
            "baits": dict(self.baits),
            "cooler": [asdict(c) for c in self.cooler],
            "records": {k: asdict(v) for k, v in self.records.items()},
            "casts": self.casts,
            "landed": self.landed,
            "lost": self.lost,
            "best_sale": self.best_sale,
        }

    @classmethod
    def from_dict(cls, data):
        """Rebuild a state from ``to_dict`` output, dropping unknown keys.

        Species, rods, spots and baits that no longer exist in the catalog
        are ignored so an old save still loads after a content update.
        """
        version = data.get("version")
        if version != SAVE_VERSION:
            raise SaveError("partida guardada con otra version (%r)" % version)

        state = cls(
            coins=int(data.get("coins", STARTING_COINS)),
            rod_key=data.get("rod_key", "bambu"),
            spot_key=data.get("spot_key", "lago"),
            casts=int(data.get("casts", 0)),
            landed=int(data.get("landed", 0)),
            lost=int(data.get("lost", 0)),
            best_sale=int(data.get("best_sale", 0)),
        )
        if state.rod_key not in catalog.RODS:
            state.rod_key = "bambu"
        state.unlocked_spots = [s for s in data.get("unlocked_spots", []) if s in catalog.SPOTS] or ["lago"]
        if state.spot_key not in state.unlocked_spots:
            state.spot_key = state.unlocked_spots[0]
        state.baits = {
            k: int(v) for k, v in data.get("baits", {}).items() if k in catalog.BAITS and int(v) > 0
        }
        state.cooler = [
            Catch(c["species_key"], float(c["weight"]))
            for c in data.get("cooler", [])
            if c.get("species_key") in catalog.SPECIES
        ]
        state.records = {
            k: Record(int(v.get("caught", 0)), float(v.get("best_weight", 0.0)))
            for k, v in data.get("records", {}).items()
            if k in catalog.SPECIES
        }
        return state

    def save(self, path):
        """Write the save file atomically so a crash cannot corrupt it."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        handle, tmp_path = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as tmp:
                json.dump(self.to_dict(), tmp, indent=2, ensure_ascii=False)
            os.replace(tmp_path, path)
        except BaseException:
            Path(tmp_path).unlink(missing_ok=True)
            raise
        return path

    @classmethod
    def load(cls, path):
        """Load a save file. Raises :class:`SaveError` if it is unusable."""
        try:
            with open(path, encoding="utf-8") as handle:
                data = json.load(handle)
        except FileNotFoundError:
            raise
        except (OSError, ValueError) as exc:
            raise SaveError("no se pudo leer la partida: %s" % exc) from exc
        if not isinstance(data, dict):
            raise SaveError("el fichero de partida no tiene el formato esperado")
        return cls.from_dict(data)
