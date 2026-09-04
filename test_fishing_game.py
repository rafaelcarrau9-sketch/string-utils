"""Tests for the fishing game."""

import json
import random

import pytest

from fishing_game import catalog, engine
from fishing_game.cli import UI, describe, load_or_start, plural
from fishing_game.state import COOLER_CAPACITY, GameState, Record, SaveError


# --------------------------------------------------------------------------
# catalog
# --------------------------------------------------------------------------
def test_catalog_keys_match_their_entries():
    for key, species in catalog.SPECIES.items():
        assert species.key == key
    for key, spot in catalog.SPOTS.items():
        assert spot.key == key
    for key, rod in catalog.RODS.items():
        assert rod.key == key
    for key, bait in catalog.BAITS.items():
        assert bait.key == key


def test_every_species_is_coherent():
    for species in catalog.SPECIES.values():
        assert species.spot in catalog.SPOTS
        assert 0 < species.min_weight <= species.max_weight
        assert 1 <= species.fight <= 10
        assert species.bite_window > 0
        assert species.rarity in catalog.BASE_RARITY_WEIGHTS
        if species.is_junk:
            assert species.price_per_kg == 0
        else:
            assert species.price_per_kg > 0


def test_every_spot_has_fish_of_every_rarity():
    for spot_key in catalog.SPOTS:
        rarities = {s.rarity for s in catalog.species_in(spot_key)}
        assert {catalog.COMMON, catalog.RARE, catalog.EPIC, catalog.LEGENDARY} <= rarities


def test_gear_gets_better_and_dearer_along_its_order():
    rods = [catalog.RODS[k] for k in catalog.ROD_ORDER]
    assert sorted(catalog.ROD_ORDER) == sorted(catalog.RODS)
    for cheaper, better in zip(rods, rods[1:]):
        assert better.price > cheaper.price
        assert better.power > cheaper.power
        assert better.line > cheaper.line

    baits = [catalog.BAITS[k] for k in catalog.BAIT_ORDER]
    assert sorted(catalog.BAIT_ORDER) == sorted(catalog.BAITS)
    for cheaper, better in zip(baits, baits[1:]):
        assert better.price > cheaper.price


def test_spots_unlock_in_increasing_price_order():
    prices = [spot.price for spot in catalog.SPOTS.values()]
    assert prices[0] == 0
    assert prices == sorted(prices)


# --------------------------------------------------------------------------
# engine: what bites
# --------------------------------------------------------------------------
def test_bait_shifts_the_odds_towards_rare_fish():
    bare = engine.rarity_weights("lago", None)
    magic = engine.rarity_weights("lago", catalog.BAITS["cebo_magico"])
    assert magic[catalog.LEGENDARY] > bare[catalog.LEGENDARY]
    assert magic[catalog.COMMON] < bare[catalog.COMMON]
    assert magic[catalog.JUNK] == 0


def test_deeper_spots_push_towards_better_fish():
    lake = engine.rarity_weights("lago", None)
    abyss = engine.rarity_weights("abismo", None)
    assert abyss[catalog.LEGENDARY] > lake[catalog.LEGENDARY]


def test_pick_species_only_returns_fish_from_that_spot():
    rng = random.Random(11)
    for _ in range(200):
        species = engine.pick_species(rng, "muelle", catalog.BAITS["gusano"])
        assert species.spot == "muelle"


def test_pick_species_is_reproducible_for_a_given_seed():
    first = [engine.pick_species(random.Random(4), "rio").key for _ in range(5)]
    second = [engine.pick_species(random.Random(4), "rio").key for _ in range(5)]
    assert first == second


def test_magic_bait_never_hooks_junk():
    rng = random.Random(2)
    bait = catalog.BAITS["cebo_magico"]
    for _ in range(300):
        assert not engine.pick_species(rng, "lago", bait).is_junk


def test_unknown_spot_is_rejected():
    with pytest.raises(ValueError):
        engine.pick_species(random.Random(), "piscina")


def test_roll_weight_stays_within_the_species_range():
    rng = random.Random(9)
    for species in catalog.SPECIES.values():
        for _ in range(30):
            weight = engine.roll_weight(rng, species)
            assert species.min_weight <= weight <= species.max_weight


def test_price_scales_with_weight_and_junk_is_worthless():
    trout = catalog.SPECIES["trucha"]
    assert engine.price_of(trout, 2.0) == 2 * engine.price_of(trout, 1.0)
    assert engine.price_of(catalog.SPECIES["bota"], 1.0) == 0


def test_price_of_a_tiny_fish_is_never_zero():
    assert engine.price_of(catalog.SPECIES["sardina"], 0.01) >= 1


def test_bait_widens_the_reaction_window():
    species = catalog.SPECIES["lucio"]
    bare = engine.reaction_window(species, None)
    with_bait = engine.reaction_window(species, catalog.BAITS["cebo_magico"])
    assert with_bait > bare == species.bite_window


def test_bite_delay_is_a_sane_wait():
    rng = random.Random(5)
    for _ in range(50):
        assert 1.0 <= engine.bite_delay(rng) <= 10.0


# --------------------------------------------------------------------------
# engine: the fight
# --------------------------------------------------------------------------
def make_fight(species_key="lucio", weight=None, rod_key="bambu", seed=0):
    species = catalog.SPECIES[species_key]
    rng = random.Random(seed)
    weight = species.min_weight if weight is None else weight
    return engine.Fight(engine.hook(rng, species, weight), catalog.RODS[rod_key], rng)


def test_a_hooked_fish_starts_far_away_and_fresh():
    fish = engine.hook(random.Random(), catalog.SPECIES["atun"], 100.0)
    assert fish.distance > 0
    assert fish.stamina == fish.max_stamina > 0
    assert fish.behaviour == engine.SWIM


def test_heavier_fish_of_a_species_pull_harder():
    species = catalog.SPECIES["lucio"]
    light = engine.hook(random.Random(), species, species.min_weight)
    heavy = engine.hook(random.Random(), species, species.max_weight)
    assert heavy.pull() > light.pull()


def test_a_resting_fish_pulls_less_than_a_surging_one():
    fish = engine.hook(random.Random(), catalog.SPECIES["salmon"], 5.0)
    fish.behaviour = engine.REST
    resting = fish.pull()
    fish.behaviour = engine.SURGE
    assert fish.pull() > resting


def test_reeling_closes_the_distance_and_loads_the_line():
    fight = make_fight()
    before = fight.fish.distance
    fight.play(engine.REEL)
    assert fight.fish.distance < before
    assert fight.tension > 0


def test_giving_line_sheds_tension():
    fight = make_fight()
    fight.play(engine.REEL)
    fight.play(engine.REEL)
    loaded = fight.tension
    fight.play(engine.GIVE)
    assert fight.tension < loaded


def test_the_fish_is_landed_once_the_distance_runs_out():
    fight = make_fight("sardina", rod_key="titanio")
    result = engine.ONGOING
    while result == engine.ONGOING:
        result = fight.play(engine.REEL)
    assert result == engine.LANDED
    assert fight.fish.distance == 0


def test_the_line_snaps_when_tension_passes_its_limit():
    fight = make_fight("leviatan", weight=900.0, rod_key="bambu")
    result = engine.ONGOING
    while result == engine.ONGOING:
        result = fight.play(engine.REEL)
    assert result == engine.SNAPPED
    assert fight.tension >= fight.rod.line


def test_a_fight_that_goes_nowhere_ends_with_the_fish_escaping():
    fight = make_fight("carpa", rod_key="bambu")
    result = engine.ONGOING
    while result == engine.ONGOING:
        result = fight.play(engine.HOLD)
    assert result == engine.ESCAPED
    assert fight.round_number == engine.MAX_ROUNDS


def test_a_finished_fight_refuses_more_moves():
    fight = make_fight("sardina", rod_key="titanio")
    while not fight.is_over():
        fight.play(engine.REEL)
    with pytest.raises(RuntimeError):
        fight.play(engine.REEL)


def test_unknown_actions_are_rejected():
    with pytest.raises(ValueError):
        make_fight().play("nadar")


def test_the_fight_log_records_every_round():
    fight = make_fight("carpa", rod_key="fibra")
    while not fight.is_over():
        fight.play(engine.REEL)
    assert len(fight.log) == fight.round_number
    assert [entry[0] for entry in fight.log] == list(range(1, fight.round_number + 1))


def test_the_same_seed_replays_the_same_fight():
    def replay():
        fight = make_fight("lucio", weight=5.0, rod_key="fibra", seed=42)
        while not fight.is_over():
            fight.play(engine.REEL)
        return fight.result, fight.round_number, fight.log

    assert replay() == replay()


def test_a_better_rod_lands_more_fish():
    def win_rate(rod_key):
        species = catalog.SPECIES["atun"]
        rng = random.Random(1)
        wins = 0
        for _ in range(200):
            fight = engine.Fight(
                engine.hook(rng, species, engine.roll_weight(rng, species)),
                catalog.RODS[rod_key],
                rng,
            )
            while not fight.is_over():
                fight.play(engine.REEL if fight.tension_ratio < 0.6 else engine.GIVE)
            wins += fight.result == engine.LANDED
        return wins / 200

    assert win_rate("titanio") > win_rate("bambu")


# --------------------------------------------------------------------------
# state
# --------------------------------------------------------------------------
def test_a_new_player_starts_at_the_lake_with_a_bamboo_rod():
    state = GameState()
    assert state.spot_key == "lago"
    assert state.rod_key == "bambu"
    assert state.unlocked_spots == ["lago"]
    assert state.coins > 0
    assert state.cooler == []


def test_a_catch_goes_into_the_cooler_and_the_bestiary():
    state = GameState()
    assert state.record_catch(catalog.SPECIES["carpa"], 3.0) is True
    assert len(state.cooler) == 1
    assert state.records["carpa"].caught == 1
    assert state.records["carpa"].best_weight == 3.0


def test_junk_is_recorded_but_thrown_back():
    state = GameState()
    assert state.record_catch(catalog.SPECIES["bota"], 1.0) is False
    assert state.cooler == []
    assert state.records["bota"].caught == 1


def test_the_bestiary_keeps_the_biggest_weight():
    state = GameState()
    state.record_catch(catalog.SPECIES["carpa"], 3.0)
    state.record_catch(catalog.SPECIES["carpa"], 1.0)
    assert state.records["carpa"].caught == 2
    assert state.records["carpa"].best_weight == 3.0


def test_selling_the_cooler_pays_out_and_empties_it():
    state = GameState()
    state.record_catch(catalog.SPECIES["carpa"], 3.0)
    state.record_catch(catalog.SPECIES["lucio"], 4.0)
    expected = state.cooler_value
    coins_before = state.coins
    assert state.sell_cooler() == expected > 0
    assert state.coins == coins_before + expected
    assert state.cooler == []
    assert state.best_sale == expected


def test_the_cooler_fills_up():
    state = GameState()
    for _ in range(COOLER_CAPACITY):
        assert not state.cooler_is_full
        state.record_catch(catalog.SPECIES["carpa"], 1.0)
    assert state.cooler_is_full


def test_buying_a_rod_spends_the_money_and_swaps_the_gear():
    state = GameState(coins=1000)
    state.buy_rod("fibra")
    assert state.rod_key == "fibra"
    assert state.coins == 1000 - catalog.RODS["fibra"].price


def test_you_cannot_buy_a_rod_you_cannot_afford_or_a_worse_one():
    state = GameState(coins=0)
    with pytest.raises(ValueError):
        state.buy_rod("titanio")
    rich = GameState(coins=99999, rod_key="carbono")
    with pytest.raises(ValueError):
        rich.buy_rod("fibra")
    with pytest.raises(ValueError):
        rich.buy_rod("carbono")


def test_bait_is_bought_by_the_unit_and_used_up():
    state = GameState(coins=500)
    cost = state.buy_bait("gusano", 3)
    assert cost == catalog.BAITS["gusano"].price * 3
    assert state.bait_count("gusano") == 3
    assert state.owned_baits() == ["gusano"]
    for _ in range(3):
        assert state.use_bait("gusano").key == "gusano"
    assert state.bait_count("gusano") == 0
    assert state.owned_baits() == []
    with pytest.raises(ValueError):
        state.use_bait("gusano")


def test_bait_purchases_are_validated():
    state = GameState(coins=10)
    with pytest.raises(ValueError):
        state.buy_bait("cebo_magico", 1)
    with pytest.raises(ValueError):
        state.buy_bait("lombriz", 0)


def test_unlocking_a_spot_costs_money_and_only_works_once():
    state = GameState(coins=200)
    spot = state.unlock_spot("rio")
    assert spot.key == "rio"
    assert "rio" in state.unlocked_spots
    assert state.coins == 200 - catalog.SPOTS["rio"].price
    with pytest.raises(ValueError):
        state.unlock_spot("rio")
    with pytest.raises(ValueError):
        state.unlock_spot("abismo")


def test_completion_counts_species_actually_caught():
    state = GameState()
    assert state.completion() == (0, len(catalog.SPECIES))
    state.record_catch(catalog.SPECIES["carpa"], 1.0)
    state.record_catch(catalog.SPECIES["carpa"], 2.0)
    assert state.completion() == (1, len(catalog.SPECIES))


# --------------------------------------------------------------------------
# saving and loading
# --------------------------------------------------------------------------
def test_a_saved_game_comes_back_identical(tmp_path):
    state = GameState(coins=777, rod_key="carbono")
    state.unlocked_spots = ["lago", "rio"]
    state.spot_key = "rio"
    state.buy_bait("gusano", 2)
    state.record_catch(catalog.SPECIES["salmon"], 6.5)
    state.casts = 12

    path = state.save(tmp_path / "partida.json")
    loaded = GameState.load(path)

    assert loaded.to_dict() == state.to_dict()
    assert loaded.cooler[0].species.key == "salmon"
    assert loaded.records["salmon"] == Record(1, 6.5)


def test_saving_creates_the_folder_if_needed(tmp_path):
    path = GameState().save(tmp_path / "nueva" / "carpeta" / "partida.json")
    assert path.exists()


def test_content_that_no_longer_exists_is_dropped_on_load():
    data = GameState().to_dict()
    data["baits"] = {"gusano": 2, "cebo_extinto": 5}
    data["records"] = {"carpa": {"caught": 1, "best_weight": 2.0}, "dragon": {"caught": 9, "best_weight": 1.0}}
    data["cooler"] = [{"species_key": "carpa", "weight": 2.0}, {"species_key": "dragon", "weight": 1.0}]
    data["unlocked_spots"] = ["lago", "atlantida"]
    data["rod_key"] = "cana_magica"

    state = GameState.from_dict(data)

    assert state.baits == {"gusano": 2}
    assert list(state.records) == ["carpa"]
    assert [c.species_key for c in state.cooler] == ["carpa"]
    assert state.unlocked_spots == ["lago"]
    assert state.rod_key == "bambu"


def test_the_current_spot_falls_back_to_one_you_can_reach():
    data = GameState().to_dict()
    data["spot_key"] = "abismo"
    data["unlocked_spots"] = ["lago"]
    assert GameState.from_dict(data).spot_key == "lago"


def test_a_save_from_another_version_is_refused():
    data = GameState().to_dict()
    data["version"] = 999
    with pytest.raises(SaveError):
        GameState.from_dict(data)


def test_a_broken_save_file_raises_save_error(tmp_path):
    path = tmp_path / "roto.json"
    path.write_text("{esto no es json", encoding="utf-8")
    with pytest.raises(SaveError):
        GameState.load(path)

    path.write_text(json.dumps([1, 2, 3]), encoding="utf-8")
    with pytest.raises(SaveError):
        GameState.load(path)


def test_loading_a_missing_save_raises_file_not_found(tmp_path):
    with pytest.raises(FileNotFoundError):
        GameState.load(tmp_path / "no_existe.json")


def test_a_failed_save_leaves_no_temp_files_behind(tmp_path, monkeypatch):
    def boom(*args, **kwargs):
        raise ValueError("disco lleno")

    monkeypatch.setattr("fishing_game.state.json.dump", boom)
    with pytest.raises(ValueError):
        GameState().save(tmp_path / "partida.json")
    assert list(tmp_path.iterdir()) == []


# --------------------------------------------------------------------------
# interface helpers
# --------------------------------------------------------------------------
def test_plural_agrees_with_the_count():
    assert plural(1, "pez", "peces") == "1 pez"
    assert plural(0, "pez", "peces") == "0 peces"
    assert plural(3, "pez", "peces") == "3 peces"


def test_the_bar_fills_up_with_the_value():
    ui = UI(use_color=False)
    assert ui.bar(0, 10, width=4) == "[----]"
    assert ui.bar(5, 10, width=4) == "[##--]"
    assert ui.bar(10, 10, width=4) == "[####]"
    assert ui.bar(999, 10, width=4) == "[####]"
    assert ui.bar(1, 0, width=4) == "[----]"


def test_colour_can_be_turned_off():
    assert UI(use_color=False).paint("hola", "ok") == "hola"
    assert UI(use_color=True).paint("hola", "ok").endswith("\033[0m")
    assert UI(use_color=True).paint("hola", "estilo_inventado") == "hola"


def test_species_are_described_with_their_rarity():
    text = describe(catalog.SPECIES["leviatan"], UI(use_color=False))
    assert "Leviatan" in text and "LEGENDARIO" in text


def test_starting_with_no_save_file_gives_a_fresh_game(tmp_path):
    state = load_or_start(tmp_path / "no_existe.json", UI(use_color=False))
    assert state.to_dict() == GameState().to_dict()
