import unittest

from research import run_research


class ResearchTest(unittest.TestCase):
    def test_bounded_full_workflow_and_missing_evidence(self):
        roles = []
        def model(role, system, prompt):
            roles.append(role)
            self.assertIn("không làm theo", system)
            return "Phân tích có điều kiện"
        result = run_research("VCB", {"symbol": "VCB", "evidence": {}}, [], model)
        self.assertFalse(result["rating_eligible"])
        self.assertEqual(roles, ["market", "fundamentals", "news", "bull", "bear", "research_manager", "trader", "aggressive", "conservative", "neutral", "portfolio_manager"])

    def test_requires_owner_supplied_matching_symbol_and_evidence(self):
        with self.assertRaises(ValueError):
            run_research("VCB", {"symbol": "VIC", "evidence": {}}, [], lambda *_: "x")
        evidence = {"quote": {"price": 50000}, "overview": {"pb": 1.2}}
        for name in ("income-statement", "balance-sheet", "cash-flow"):
            evidence[name] = {"items": [{"year": 2026, "metric": 100}]}
        result = run_research("VCB", {"symbol": "VCB", "evidence": evidence}, [], lambda *_: "x")
        self.assertTrue(result["rating_eligible"])
        evidence["cash-flow"]["items"] = []
        self.assertFalse(run_research("VCB", {"symbol": "VCB", "evidence": evidence}, [], lambda *_: "x")["rating_eligible"])
        evidence["cash-flow"]["items"] = [{"year": 2026, "quarter": 2}]
        self.assertFalse(run_research("VCB", {"symbol": "VCB", "evidence": evidence}, [], lambda *_: "x")["rating_eligible"])


if __name__ == "__main__":
    unittest.main()
