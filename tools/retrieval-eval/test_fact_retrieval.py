import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from fact_retrieval import (  # noqa: E402
    Query,
    bootstrap_ci,
    combine_raw,
    derive_queries,
    evaluate_documents,
    evaluate_manifest,
    load_corpus,
    load_manifest,
    main,
    metrics,
    queries_from_rows,
    summarize,
    summaries,
    validate_manifest,
)


def corpus_rows():
    return [
        {"index": 1, "chapter": 1, "draft": "one", "storyBible": ""},
        {"index": 2, "chapter": 1, "draft": "two", "storyBible": ""},
        {"index": 3, "chapter": 2, "draft": "three", "storyBible": ""},
        {"index": 4, "chapter": 2, "draft": "four", "storyBible": ""},
        {"index": 5, "chapter": 3, "draft": "five", "storyBible": ""},
    ]


class DeriveQueriesTests(unittest.TestCase):
    def test_adjacent_chapters_are_hard_negatives_excluded_from_relevant(self):
        corpus = corpus_rows()
        corpus[0]["storyBible"] = "Ch2: the trader disappears"
        [query] = derive_queries(corpus)
        self.assertEqual(query.relevant, (2, 3))
        # Chapters 1 and 3 are plausible near misses, not relevant.
        self.assertEqual(query.hard_negatives, (0, 1, 4))
        self.assertFalse(set(query.relevant) & set(query.hard_negatives))

    def test_a_fact_for_a_missing_chapter_becomes_a_noise_query(self):
        corpus = corpus_rows()
        corpus[0]["storyBible"] = "Ch99: a global fact"
        [query] = derive_queries(corpus)
        self.assertEqual(query.kind, "noise")
        self.assertEqual(query.relevant, ())
        self.assertEqual(query.hard_negatives, ())


class QueryRowTests(unittest.TestCase):
    def test_explicit_rows_are_validated(self):
        rows = [
            {"id": "a", "text": "one", "relevant": [0], "hard_negatives": [1]},
            {"id": "n", "text": "noise", "relevant": [], "kind": "noise"},
        ]
        queries = queries_from_rows(rows, 3)
        self.assertEqual(queries[0].relevant, (0,))
        self.assertEqual(queries[1].kind, "noise")

    def test_out_of_range_overlap_and_noise_with_relevant_are_rejected(self):
        cases = [
            [{"text": "x", "relevant": [9]}],
            [{"text": "x", "relevant": [0], "hard_negatives": [0]}],
            [{"text": "x", "relevant": [0], "kind": "noise"}],
            [{"text": ""}],
            [{"text": "x"}, {"text": "y", "id": "q1"}],
        ]
        # The last case is duplicate ids, not missing text.
        cases[-1] = [{"text": "x", "id": "q1"}, {"text": "y", "id": "q1"}]
        for rows in cases:
            with self.assertRaises(ValueError):
                queries_from_rows(rows, 3)

    def test_empty_query_set_is_rejected(self):
        with self.assertRaises(ValueError):
            queries_from_rows([], 3)


class MetricsTests(unittest.TestCase):
    def test_reports_mrr_hit_rates_hard_negative_and_noise_rows(self):
        queries = [
            Query("q1", "a", (0,), (2,)),
            Query("q2", "b", (1,), (0,)),
            Query("n1", "noise", (), (0,), kind="noise"),
        ]
        scores = [
            [0.9, 0.8, 0.1],  # relevant first
            [0.9, 0.8, 0.1],  # hard negative first, relevant second
            [0.9, 0.1, 0.0],  # noise: hard negative first
        ]
        raw = metrics(scores, queries)
        self.assertEqual(raw["scoredQueries"], 2)
        self.assertEqual(raw["noiseQueries"], 1)
        self.assertAlmostEqual(sum(raw["reciprocalRanks"]) / 2, 0.75)
        self.assertAlmostEqual(sum(raw["hit1"]) / 2, 0.5)
        self.assertAlmostEqual(sum(raw["hit3"]) / 2, 1.0)
        self.assertAlmostEqual(sum(raw["hardNegativeTop1"]) / 2, 0.5)
        self.assertEqual(raw["noiseHardNegativeTop1"], [1.0])

    def test_a_query_with_no_relevant_scene_is_not_scored(self):
        raw = metrics([[1.0, 0.0]], [Query("n", "noise", (), kind="noise")])
        self.assertEqual(raw["scoredQueries"], 0)
        self.assertEqual(raw["noiseQueries"], 1)
        self.assertEqual(raw["reciprocalRanks"], [])

    def test_one_score_row_per_query_is_required(self):
        with self.assertRaises(ValueError):
            metrics([[1.0]], [Query("q", "x", (0,)), Query("q2", "y", (1,))])


class BootstrapTests(unittest.TestCase):
    def test_is_deterministic_and_brackets_the_mean(self):
        values = [1.0, 0.0, 0.5, 1.0, 0.0]
        mean = sum(values) / len(values)
        first = bootstrap_ci(values, n_boot=2000, seed=7)
        second = bootstrap_ci(values, n_boot=2000, seed=7)
        self.assertEqual(first, second)
        self.assertLessEqual(first[0], mean)
        self.assertGreaterEqual(first[1], mean)

    def test_empty_values_have_no_interval(self):
        self.assertIsNone(bootstrap_ci([]))

    def test_summarize_carries_intervals(self):
        raw = metrics(
            [[1.0, 0.0], [0.0, 1.0]],
            [Query("q1", "a", (0,)), Query("q2", "b", (1,))],
        )
        report = summarize(raw, n_boot=100, seed=1)
        self.assertEqual(report["mrr"], 1.0)
        self.assertEqual(report["mrrCI"], [1.0, 1.0])


class CombineTests(unittest.TestCase):
    def test_pools_per_query_rows_rather_than_averaging_averages(self):
        a = {
            "queries": 1,
            "scoredQueries": 1,
            "noiseQueries": 0,
            "reciprocalRanks": [1.0],
            "hit1": [1.0],
            "hit3": [1.0],
            "hardNegativeTop1": [0.0],
            "noiseHardNegativeTop1": [],
        }
        b = {
            "queries": 2,
            "scoredQueries": 1,
            "noiseQueries": 1,
            "reciprocalRanks": [0.0],
            "hit1": [0.0],
            "hit3": [0.0],
            "hardNegativeTop1": [1.0],
            "noiseHardNegativeTop1": [1.0],
        }
        pooled = combine_raw([a, b])
        self.assertEqual(pooled["queries"], 3)
        self.assertEqual(pooled["scoredQueries"], 2)
        self.assertEqual(pooled["noiseQueries"], 1)
        self.assertEqual(pooled["reciprocalRanks"], [1.0, 0.0])
        self.assertAlmostEqual(sum(pooled["reciprocalRanks"]) / 2, 0.5)


class LoadingTests(unittest.TestCase):
    def test_corpus_accepts_a_scenes_wrapper_and_stamps_missing_indices(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "corpus.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"scenes": [{"chapter": 1, "draft": "x"}]}, handle)
            [scene] = load_corpus(path)
            self.assertEqual(scene["index"], 1)

    def test_manifest_requires_unique_ids_and_a_corpus(self):
        with tempfile.TemporaryDirectory() as tmp:
            good = os.path.join(tmp, "good.json")
            with open(good, "w", encoding="utf-8") as handle:
                json.dump({"books": [{"id": "a", "corpus": "c.json"}]}, handle)
            self.assertEqual(load_manifest(good)[0]["id"], "a")

            for books in (
                [{"id": "a", "corpus": "c.json"}, {"id": "a", "corpus": "d.json"}],
                [{"id": "a"}],
                [],
            ):
                path = os.path.join(tmp, "bad.json")
                with open(path, "w", encoding="utf-8") as handle:
                    json.dump({"books": books}, handle)
                with self.assertRaises(ValueError):
                    load_manifest(path)

    def test_inline_summaries_win_and_cached_summaries_are_reused(self):
        corpus = [{"index": 1, "chapter": 1, "draft": "x", "summary": "inline"}]
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(summaries(corpus, tmp, generate=None), ["inline"])

            corpus = [{"index": 2, "chapter": 1, "draft": "y"}]
            with open(os.path.join(tmp, "summaries.json"), "w", encoding="utf-8") as handle:
                json.dump({"2": "cached"}, handle)
            self.assertEqual(summaries(corpus, tmp, generate=None), ["cached"])

    def test_evaluate_documents_reports_each_docs_scorer_pair(self):
        corpus = corpus_rows()
        queries = [
            Query("q1", "one", (0,), (1,)),
            Query("q2", "two", (1,), (0,)),
        ]

        def scorer(query_texts, doc_texts):
            return [[1.0 if i == 0 else 0.0 for i in range(len(doc_texts))] for _ in query_texts]

        report, raws = evaluate_documents(
            corpus,
            queries,
            {"summary": [c["draft"] for c in corpus]},
            {"fake": scorer},
            n_boot=50,
        )
        self.assertEqual(report["summary"]["fake"]["queries"], 2)
        self.assertIn("summary|fake", raws)


class ManifestEvaluationTests(unittest.TestCase):
    def test_two_books_report_per_book_and_pooled_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            corpora = {
                "a": [
                    {"index": 1, "chapter": 1, "draft": "a1", "summary": "alpha one", "storyBible": "Ch1: alpha fact"},
                    {"index": 2, "chapter": 1, "draft": "a2", "summary": "alpha two", "storyBible": ""},
                ],
                "b": [
                    {"index": 1, "chapter": 1, "draft": "b1", "summary": "beta one", "storyBible": "Ch1: beta fact"},
                    {"index": 2, "chapter": 1, "draft": "b2", "summary": "beta two", "storyBible": ""},
                    {"index": 3, "chapter": 2, "draft": "b3", "summary": "beta three", "storyBible": ""},
                ],
            }
            books = []
            for book_id, scenes in corpora.items():
                path = os.path.join(tmp, f"{book_id}.json")
                with open(path, "w", encoding="utf-8") as handle:
                    json.dump(scenes, handle)
                books.append({"id": book_id, "corpus": path, "docs": ["summary"]})

            result = evaluate_manifest(
                books, cache_dir=tmp, use_embeddings=False, n_boot=20, seed=1
            )
            self.assertEqual(set(result["books"]), {"a", "b"})
            self.assertEqual(result["books"]["a"]["queries"], 1)
            self.assertEqual(result["books"]["b"]["queries"], 1)
            self.assertEqual(result["overall"]["summary"]["bm25"]["queries"], 2)


class ValidateManifestTests(unittest.TestCase):
    def test_validate_manifest_reports_structure_without_scoring(self):
        with tempfile.TemporaryDirectory() as tmp:
            corpus_path = os.path.join(tmp, "book.json")
            with open(corpus_path, "w", encoding="utf-8") as handle:
                json.dump(
                    [
                        {"index": 1, "chapter": 1, "draft": "a", "summary": "x", "storyBible": "Ch1: fact"},
                        {"index": 2, "chapter": 1, "draft": "b", "summary": "y", "storyBible": ""},
                    ],
                    handle,
                )
            queries_path = os.path.join(tmp, "queries.json")
            with open(queries_path, "w", encoding="utf-8") as handle:
                json.dump([{"id": "q1", "text": "fact", "relevant": [0], "hard_negatives": [1]}], handle)
            manifest_path = os.path.join(tmp, "manifest.json")
            with open(manifest_path, "w", encoding="utf-8") as handle:
                json.dump(
                    {"books": [{"id": "book", "corpus": corpus_path, "queriesPath": queries_path, "docs": ["summary"]}]},
                    handle,
                )

            books = load_manifest(manifest_path)
            report = validate_manifest(books)
            self.assertTrue(report["ok"])
            self.assertEqual(report["books"]["book"]["querySource"], "explicit")
            self.assertEqual(report["books"]["book"]["factQueries"], 1)

    def test_cli_validate_does_not_write_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            corpus_path = os.path.join(tmp, "book.json")
            with open(corpus_path, "w", encoding="utf-8") as handle:
                json.dump(
                    [{"index": 1, "chapter": 1, "draft": "a", "storyBible": "Ch1: fact"}],
                    handle,
                )
            manifest_path = os.path.join(tmp, "manifest.json")
            with open(manifest_path, "w", encoding="utf-8") as handle:
                json.dump({"books": [{"id": "book", "corpus": corpus_path}]}, handle)
            out_cache = os.path.join(tmp, "cache")
            rc = main(["--manifest", manifest_path, "--cache", out_cache, "--validate"])
            self.assertEqual(rc, 0)
            self.assertFalse(os.path.exists(os.path.join(out_cache, "results.json")))


if __name__ == "__main__":
    unittest.main()
