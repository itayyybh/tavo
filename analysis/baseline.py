"""
Phase 1 baseline — how good is the rules-based seating scorer, really?

Reads analysis/data/decisions.csv (see export_decisions.sql) and reports:

  1. Ranking accuracy of `ruleScorer` (top-1 / top-3 / MRR).
  2. A taxonomy of the cases where the host did NOT take the engine's top pick,
     split by how much the engine actually preferred its own choice.
  3. Data-quality checks on the outcome fields, which decide whether any
     outcome-based evaluation is possible at all.

Rows come in three kinds and must not be mixed:

  decided   - the engine ranked options and the host took one. Only these carry
              a rank position, so only these can be scored.
  abandoned - the engine ranked options and the host took nothing. No rank
              exists. Scoring these as failures would understate the engine;
              ignoring them entirely would hide where it offered nothing usable.
  repack    - an empty ranked set from the assignment optimiser, by design.

Before 2026-09, decisions were persisted only on acceptance, so `abandoned` is
structurally absent from older exports rather than genuinely zero.

The metric is deliberately NOT the `overridden` flag. That flag collapses
"host took option #2" and "host took something never offered" into one boolean.
Because `ranked` stores the full ordered list, the rank position of the accepted
set is recoverable, which turns this into a standard ranking evaluation.

Caveat that governs every number below: this measures AGREEMENT with the host,
not seating QUALITY. A host who clicks the first option out of habit looks
identical to a host who clicks it because it was right.
"""

import pandas as pd

TIE = 0.001  # score difference below which two options are effectively tied


def load(path="data/decisions.csv"):
    return pd.read_csv(path, na_values=["null", ""])


def classify(df):
    """Split rows into decided / abandoned / repack (see the module docstring).

    Older exports predate the `accepted` column; there every persisted row was
    an acceptance by construction, so it is inferred from `chosen_rank`.
    """
    accepted = df.accepted if "accepted" in df.columns else df.chosen_rank.notna()
    offered = df.n_ranked > 0
    return {
        "decided": df[offered & accepted],
        "abandoned": df[offered & ~accepted],
        "repack": df[~offered],
        "has_accepted_column": "accepted" in df.columns,
    }


def ranking_metrics(decided):
    """Top-k and MRR. Scored ONLY on rows where the host actually chose."""
    n = len(decided)
    r = decided.chosen_rank
    return {
        "decisions_with_suggestions": n,
        "top_1": (r == 1).sum() / n,
        "top_3": (r <= 3).sum() / n,
        "top_5": (r <= 5).sum() / n,
        "never_offered": r.isna().sum(),
        "mrr": (1 / r).mean(),
    }


def failure_taxonomy(df):
    """Split non-top-1 decisions by how strongly the engine preferred its pick.

    A zero score gap means the engine rated both options identically — the order
    was decided by candidate generation order, not by the scorer. Those are
    tie-break artifacts, not ranking errors, and they should not be counted
    against the scorer.
    """
    bad = df[df.chosen_rank >= 2].copy()
    bad["mode"] = pd.cut(
        bad.score_gap,
        [-1, TIE, 0.5, 2, float("inf")],
        labels=["tie", "near_tie", "small_gap", "real_disagreement"],
    )
    return bad


def outcome_quality(df):
    """Is `actual_minutes` usable as ground truth? (Spoiler: not yet.)"""
    a = df.actual_minutes.dropna()
    return {
        "rows_with_outcome": len(a),
        "plausible_30_240_min": int(((a >= 30) & (a <= 240)).sum()),
        "under_5_min": int((a < 5).sum()),
        "over_6_hours": int((a > 360).sum()),
        "median_minutes": float(a.median()),
        "predicted_is_constant_120": float((df.predicted_minutes == 120).mean()),
    }


def main():
    df = load()
    rows = classify(df)
    m = ranking_metrics(rows["decided"])
    bad = failure_taxonomy(rows["decided"])
    q = outcome_quality(df)

    print("=" * 62)
    print("WHAT THE ROWS ARE")
    print("=" * 62)
    print(f"decided (host chose)       : {len(rows['decided']):>4}")
    print(f"abandoned (host chose none): {len(rows['abandoned']):>4}")
    print(f"repack (no ranked set)     : {len(rows['repack']):>4}")
    offered = len(rows["decided"]) + len(rows["abandoned"])
    if not rows["has_accepted_column"]:
        print("\nNOTE: export has no `accepted` column, so abandoned runs cannot be")
        print("distinguished. Re-export with the current export_decisions.sql.")
    elif offered:
        print(f"\nabandonment rate           : {len(rows['abandoned']) / offered:.1%}")
        print("(the engine offered options and the host took none)")
    print()

    print("=" * 62)
    print("RANKING BASELINE — ruleScorer")
    print("=" * 62)
    print(f"decisions with suggestions : {m['decisions_with_suggestions']}")
    print(f"top-1 accuracy             : {m['top_1']:.1%}")
    print(f"top-3 accuracy             : {m['top_3']:.1%}")
    print(f"top-5 accuracy             : {m['top_5']:.1%}")
    print(f"MRR                        : {m['mrr']:.3f}")
    print(f"accepted set never offered : {m['never_offered']}")

    print("\n" + "=" * 62)
    print("WHERE THE HOST DISAGREED")
    print("=" * 62)
    counts = bad["mode"].value_counts().reindex(
        ["tie", "near_tie", "small_gap", "real_disagreement"]
    ).fillna(0).astype(int)
    for mode, n in counts.items():
        print(f"{mode:<20}: {n:>3}")

    ties = int(counts["tie"] + counts["near_tie"])
    genuine = len(bad) - ties
    adjusted = (m["top_1"] * m["decisions_with_suggestions"] + ties) / m[
        "decisions_with_suggestions"
    ]
    print(f"\nties are not scorer errors — the scorer rated both equally.")
    print(f"genuine ranking errors     : {genuine} of {m['decisions_with_suggestions']}")
    print(f"top-1 excluding ties       : {adjusted:.1%}")

    print("\n" + "=" * 62)
    print("OUTCOME DATA QUALITY")
    print("=" * 62)
    print(f"rows with actual_minutes   : {q['rows_with_outcome']}")
    print(f"  plausible (30-240 min)   : {q['plausible_30_240_min']}")
    print(f"  under 5 min              : {q['under_5_min']}")
    print(f"  over 6 hours             : {q['over_6_hours']}")
    print(f"  median                   : {q['median_minutes']:.0f} min")
    print(f"predicted_minutes == 120   : {q['predicted_is_constant_120']:.1%}")
    print("\nVERDICT: outcome fields cannot support evaluation yet.")
    print("`actual_minutes` measures time-until-cleared-in-UI, not seated duration,")
    print("and `predicted_minutes` is a constant default, not a prediction.")


if __name__ == "__main__":
    main()
