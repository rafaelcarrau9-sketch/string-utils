"""Terminal interface for the fishing game."""

import argparse
import os
import random
import sys
import time

from . import catalog, engine
from .state import COOLER_CAPACITY, DEFAULT_SAVE_PATH, GameState, SaveError

RESET = "\033[0m"
STYLES = {
    "titulo": "\033[1;36m",
    "ok": "\033[1;32m",
    "aviso": "\033[1;33m",
    "malo": "\033[1;31m",
    "tenue": "\033[2m",
    "raro": "\033[1;34m",
    "epico": "\033[1;35m",
    "legendario": "\033[1;33m",
}

RARITY_STYLE = {
    catalog.JUNK: "tenue",
    catalog.COMMON: None,
    catalog.RARE: "raro",
    catalog.EPIC: "epico",
    catalog.LEGENDARY: "legendario",
}

BANNER = r"""
   ___  ____ ____  ____ ____
  / _ \/ __// __/ / __// _  |     P E S C A
 / ___/ _/ _\ \  / /__/ __  |     un juego de cana y paciencia
/_/  /___//___/  \___/_/ |_|
"""


class UI:
    """Printing, colours and prompts. Kept apart from the game rules."""

    def __init__(self, use_color=True, fast=False):
        self.use_color = use_color
        self.fast = fast

    # -- output ----------------------------------------------------------
    def paint(self, text, style=None):
        if not style or not self.use_color or style not in STYLES:
            return text
        return "%s%s%s" % (STYLES[style], text, RESET)

    def say(self, text="", style=None):
        print(self.paint(text, style))

    def rule(self, title=""):
        line = "-" * 52
        if title:
            line = "--- %s %s" % (title, "-" * max(0, 48 - len(title)))
        self.say(line, "tenue")

    def pause(self, seconds):
        if not self.fast:
            time.sleep(seconds)

    def suspense(self, seconds, chunk=0.45):
        """Print dots while waiting, so the wait feels like fishing."""
        if self.fast:
            return
        elapsed = 0.0
        while elapsed < seconds:
            sys.stdout.write(".")
            sys.stdout.flush()
            time.sleep(chunk)
            elapsed += chunk
        print()

    def bar(self, value, maximum, width=12, style=None):
        filled = 0 if maximum <= 0 else int(round(width * min(1.0, value / maximum)))
        return self.paint("[%s%s]" % ("#" * filled, "-" * (width - filled)), style)

    # -- input -----------------------------------------------------------
    def ask(self, prompt=""):
        """Read a line. Returns ``None`` on EOF or Ctrl-C."""
        try:
            return input(prompt).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return None

    def choose(self, prompt, options):
        """Ask until the player picks one of ``options`` (key, label) pairs.

        Accepts the option number or the option key. Returns ``None`` on EOF.
        """
        for index, (_, label) in enumerate(options, start=1):
            self.say("  %d) %s" % (index, label))
        while True:
            answer = self.ask(prompt)
            if answer is None:
                return None
            answer = answer.lower()
            if answer.isdigit() and 1 <= int(answer) <= len(options):
                return options[int(answer) - 1][0]
            for key, _ in options:
                if answer and key.lower().startswith(answer):
                    return key
            self.say("No te he entendido.", "aviso")

    def confirm(self, prompt):
        answer = self.ask("%s (s/n) " % prompt)
        return bool(answer) and answer.lower().startswith("s")

    def flush_input(self):
        """Drop anything typed ahead, so mashing keys cannot fake a strike."""
        try:
            import termios

            termios.tcflush(sys.stdin, termios.TCIFLUSH)
        except Exception:  # not a terminal, or not POSIX
            pass


def plural(count, singular, plural_form):
    """Return e.g. ``1 pez`` / ``3 peces``."""
    return "%d %s" % (count, singular if count == 1 else plural_form)


def describe(species, ui):
    """Species name coloured by rarity, with the rarity spelled out."""
    style = RARITY_STYLE.get(species.rarity)
    label = catalog.RARITY_LABELS[species.rarity]
    return "%s %s" % (ui.paint(species.name, style), ui.paint("(%s)" % label, "tenue"))


class Game:
    """Wires player state, the rules engine and the terminal UI together."""

    def __init__(self, state, ui, rng=None, save_path=DEFAULT_SAVE_PATH):
        self.state = state
        self.ui = ui
        self.rng = rng or random.Random()
        self.save_path = save_path

    # -- main loop -------------------------------------------------------
    def run(self):
        ui = self.ui
        ui.say(BANNER, "titulo")
        ui.say("Escribe el numero o la primera letra de cada opcion.", "tenue")
        while True:
            self.show_status()
            choice = ui.choose(
                "> ",
                [
                    ("pescar", "Pescar"),
                    ("viajar", "Viajar a otra zona"),
                    ("vender", "Vender la nevera (%s, %d monedas)" % (plural(len(self.state.cooler), "pez", "peces"), self.state.cooler_value)),
                    ("tienda", "Tienda"),
                    ("bestiario", "Bestiario"),
                    ("guardar", "Guardar y salir"),
                ],
            )
            if choice is None or choice == "guardar":
                self.save(announce=True)
                ui.say("Hasta la proxima. Que piquen.", "titulo")
                return
            ui.say()
            getattr(self, "menu_%s" % choice)()
            ui.say()

    def show_status(self):
        state = self.state
        ui = self.ui
        found, total = state.completion()
        ui.rule(state.spot.name)
        ui.say(
            "  %s monedas | %s | nevera %d/%d | bestiario %d/%d"
            % (
                ui.paint(str(state.coins), "ok"),
                state.rod.name,
                len(state.cooler),
                COOLER_CAPACITY,
                found,
                total,
            )
        )

    def save(self, announce=False):
        try:
            self.state.save(self.save_path)
        except OSError as exc:
            self.ui.say("No se pudo guardar la partida: %s" % exc, "malo")
            return
        if announce:
            self.ui.say("Partida guardada en %s" % self.save_path, "tenue")

    # -- fishing ---------------------------------------------------------
    def menu_pescar(self):
        ui = self.ui
        state = self.state
        if state.cooler_is_full:
            ui.say("La nevera esta llena.", "aviso")
            if not ui.confirm("Vender lo que llevas por %d monedas?" % state.cooler_value):
                return
            self.menu_vender()

        bait = self.choose_bait()
        if bait is False:  # player backed out
            return

        state.casts += 1
        ui.say()
        ui.say("Lanzas el sedal al %s..." % state.spot.name)
        ui.suspense(engine.bite_delay(self.rng, bait))

        species = engine.pick_species(self.rng, state.spot_key, bait)
        weight = engine.roll_weight(self.rng, species)
        window = engine.reaction_window(species, bait)

        ui.flush_input()
        ui.say("PICA! Pulsa ENTER!", "aviso")
        start = time.monotonic()
        answer = ui.ask("")
        elapsed = time.monotonic() - start
        if answer is None:
            ui.say("Sueltas la cana. El pez se va.", "tenue")
            state.lost += 1
            self.save()
            return
        if elapsed > window:
            ui.say(
                "Demasiado tarde (%.1fs, tenias %.1fs). Se ha escapado." % (elapsed, window),
                "malo",
            )
            state.lost += 1
            self.save()
            return

        ui.say("Clavado en %.2fs! Algo tira fuerte..." % elapsed, "ok")
        ui.pause(0.6)
        self.fight(species, weight)
        self.save()

    def choose_bait(self):
        """Pick bait for this cast. Returns a Bait, ``None`` (bare hook)
        or ``False`` if the player cancelled."""
        state = self.state
        owned = state.owned_baits()
        if not owned:
            self.ui.say("Sin cebo: picara cualquier cosa (y casi todo sera basura).", "tenue")
            return None
        options = [(k, "%s x%d" % (catalog.BAITS[k].name, state.baits[k])) for k in owned]
        options.append(("nada", "Sin cebo"))
        options.append(("volver", "Volver"))
        self.ui.say("Que cebo pones?")
        choice = self.ui.choose("> ", options)
        if choice is None or choice == "volver":
            return False
        if choice == "nada":
            return None
        return state.use_bait(choice)

    def fight(self, species, weight):
        """Run the tug of war until the fish is landed or lost."""
        ui = self.ui
        fish = engine.hook(self.rng, species, weight)
        fight = engine.Fight(fish, self.state.rod, self.rng)
        start_distance = fish.distance

        while not fight.is_over():
            ui.say()
            ui.rule()
            tension_style = "malo" if fight.tension_ratio > 0.7 else ("aviso" if fight.tension_ratio > 0.45 else "ok")
            ui.say(
                "  Distancia %5.1f m %s   Tension %4.1f/%.0f %s"
                % (
                    fish.distance,
                    ui.bar(start_distance - fish.distance, start_distance, 10),
                    fight.tension,
                    fight.rod.line,
                    ui.bar(fight.tension, fight.rod.line, 10, tension_style),
                )
            )
            ui.say(
                "  El pez %s   Fuerzas %s"
                % (
                    ui.paint(fish.behaviour.upper(), "malo" if fish.behaviour == engine.SURGE else None),
                    ui.bar(fish.stamina, fish.max_stamina, 10),
                )
            )
            action = ui.choose(
                "> ",
                [
                    (engine.REEL, "Recoger (ganas metros, tensas el sedal)"),
                    (engine.GIVE, "Soltar hilo (bajas la tension, pierdes metros)"),
                    (engine.HOLD, "Aguantar (esperas a que se canse)"),
                ],
            )
            if action is None:
                ui.say("Sueltas la cana.", "tenue")
                self.state.lost += 1
                return
            fight.play(action)

        ui.say()
        if fight.result == engine.LANDED:
            self.on_landed(species, weight, fight)
        elif fight.result == engine.SNAPPED:
            ui.say("CRAC. El sedal se ha roto. %s se va." % species.name, "malo")
            self.state.lost += 1
        else:
            ui.say("El anzuelo se suelta. %s desaparece en el agua." % species.name, "malo")
            self.state.lost += 1

    def on_landed(self, species, weight, fight):
        ui = self.ui
        state = self.state
        previous = state.records.get(species.key)
        is_new = previous is None or previous.caught == 0
        is_record = previous is not None and 0 < previous.best_weight < weight

        kept = state.record_catch(species, weight)
        ui.say("Cobrado en %d rondas: %s de %.2f kg" % (fight.round_number, describe(species, ui), weight), "ok")
        if species.is_junk:
            ui.say("No vale nada. Lo tiras de vuelta.", "tenue")
        else:
            ui.say("Vale %d monedas. A la nevera." % engine.price_of(species, weight), "tenue")
        if is_new:
            ui.say("Nueva especie para el bestiario!", "titulo")
        elif is_record:
            ui.say("Record personal de esta especie!", "titulo")
        if kept and state.cooler_is_full:
            ui.say("La nevera esta llena: pasa por la tienda a vender.", "aviso")

    # -- other menus -----------------------------------------------------
    def menu_viajar(self):
        ui = self.ui
        state = self.state
        options = []
        for key in catalog.SPOTS:
            spot = catalog.SPOTS[key]
            if key in state.unlocked_spots:
                label = "%s - %s" % (spot.name, spot.description)
                if key == state.spot_key:
                    label += " (estas aqui)"
            else:
                label = "%s - abrir por %d monedas" % (spot.name, spot.price)
            options.append((key, label))
        options.append(("volver", "Volver"))

        ui.say("A donde vas?")
        choice = ui.choose("> ", options)
        if choice is None or choice == "volver":
            return
        if choice in state.unlocked_spots:
            state.spot_key = choice
            ui.say("Ahora pescas en %s." % state.spot.name, "ok")
        else:
            spot = catalog.SPOTS[choice]
            if not ui.confirm("Abrir %s por %d monedas?" % (spot.name, spot.price)):
                return
            try:
                state.unlock_spot(choice)
            except ValueError as exc:
                ui.say(str(exc).capitalize() + ".", "malo")
                return
            state.spot_key = choice
            ui.say("Zona abierta. Bienvenido a %s." % spot.name, "ok")
        self.save()

    def menu_vender(self):
        state = self.state
        if not state.cooler:
            self.ui.say("La nevera esta vacia.", "tenue")
            return
        for catch in state.cooler:
            self.ui.say("  %-24s %7.2f kg  %5d" % (catch.species.name, catch.weight, catch.price))
        earned = state.sell_cooler()
        self.ui.say("Vendido todo por %d monedas. Tienes %d." % (earned, state.coins), "ok")
        self.save()

    def menu_tienda(self):
        ui = self.ui
        while True:
            ui.rule("Tienda")
            ui.say("  Llevas %s monedas." % ui.paint(str(self.state.coins), "ok"))
            choice = ui.choose(
                "> ",
                [
                    ("canas", "Canas"),
                    ("cebos", "Cebos"),
                    ("vender", "Vender la nevera (%d monedas)" % self.state.cooler_value),
                    ("volver", "Volver"),
                ],
            )
            if choice is None or choice == "volver":
                return
            if choice == "vender":
                self.menu_vender()
            elif choice == "canas":
                self.buy_rod()
            else:
                self.buy_bait()

    def buy_rod(self):
        ui = self.ui
        state = self.state
        current = catalog.ROD_ORDER.index(state.rod_key)
        options = []
        for index, key in enumerate(catalog.ROD_ORDER):
            rod = catalog.RODS[key]
            if index <= current:
                continue
            options.append(
                (key, "%s - %d monedas (fuerza %.1f, sedal %.0f)" % (rod.name, rod.price, rod.power, rod.line))
            )
        if not options:
            ui.say("Ya tienes la mejor cana del mercado.", "tenue")
            return
        options.append(("volver", "Volver"))
        ui.say("Tu cana: %s (fuerza %.1f, sedal %.0f)" % (state.rod.name, state.rod.power, state.rod.line))
        choice = ui.choose("> ", options)
        if choice is None or choice == "volver":
            return
        try:
            rod = state.buy_rod(choice)
        except ValueError as exc:
            ui.say(str(exc).capitalize() + ".", "malo")
            return
        ui.say("Ahora pescas con %s." % rod.name, "ok")
        self.save()

    def buy_bait(self):
        ui = self.ui
        state = self.state
        options = [
            (key, "%s - %d monedas (tienes %d)" % (catalog.BAITS[key].name, catalog.BAITS[key].price, state.bait_count(key)))
            for key in catalog.BAIT_ORDER
        ]
        options.append(("volver", "Volver"))
        choice = ui.choose("> ", options)
        if choice is None or choice == "volver":
            return
        bait = catalog.BAITS[choice]
        answer = ui.ask("Cuantos? (ENTER para 1) ")
        if answer is None:
            return
        try:
            amount = int(answer) if answer else 1
        except ValueError:
            ui.say("Eso no es un numero.", "aviso")
            return
        try:
            cost = state.buy_bait(choice, amount)
        except ValueError as exc:
            ui.say(str(exc).capitalize() + ".", "malo")
            return
        ui.say("Compras %d x %s por %d monedas." % (amount, bait.name, cost), "ok")
        self.save()

    def menu_bestiario(self):
        ui = self.ui
        state = self.state
        found, total = state.completion()
        ui.rule("Bestiario  %d/%d" % (found, total))
        for spot_key, spot in catalog.SPOTS.items():
            ui.say("  %s" % spot.name, "titulo")
            for species in catalog.species_in(spot_key):
                record = state.records.get(species.key)
                if record and record.caught:
                    ui.say(
                        "    %-24s x%-4d record %6.2f kg  %s"
                        % (species.name, record.caught, record.best_weight, catalog.RARITY_LABELS[species.rarity])
                    )
                else:
                    ui.say("    %-24s %s" % ("???", ui.paint(catalog.RARITY_LABELS[species.rarity], "tenue")))
        ui.say()
        ui.say(
            "  Lanzamientos %d | cobrados %d | perdidos %d | mejor venta %d"
            % (state.casts, state.landed, state.lost, state.best_sale),
            "tenue",
        )


def load_or_start(path, ui):
    """Load the save at ``path``, or start a fresh game if there is none."""
    try:
        state = GameState.load(path)
    except FileNotFoundError:
        ui.say("Partida nueva. Empiezas con %d monedas y una cana de bambu." % GameState().coins, "tenue")
        return GameState()
    except SaveError as exc:
        ui.say("%s" % exc, "malo")
        if not ui.confirm("Empezar una partida nueva encima?"):
            raise SystemExit(1)
        return GameState()
    ui.say("Partida cargada de %s" % path, "tenue")
    return state


def main(argv=None):
    parser = argparse.ArgumentParser(description="Pesca: un juego de cana y paciencia.")
    parser.add_argument("--save", default=str(DEFAULT_SAVE_PATH), help="ruta del fichero de partida")
    parser.add_argument("--seed", type=int, default=None, help="semilla para una partida reproducible")
    parser.add_argument("--no-color", action="store_true", help="salida sin colores")
    parser.add_argument("--fast", action="store_true", help="sin esperas (util para probar)")
    args = parser.parse_args(argv)

    use_color = not args.no_color and sys.stdout.isatty() and not os.environ.get("NO_COLOR")
    ui = UI(use_color=use_color, fast=args.fast)
    state = load_or_start(args.save, ui)
    game = Game(state, ui, rng=random.Random(args.seed), save_path=args.save)
    game.run()
    return 0
