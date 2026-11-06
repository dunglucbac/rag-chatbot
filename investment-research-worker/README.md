# Investment research worker

This is the isolated decision workflow for Vietnamese stock research. It is
not yet connected to the application queue or model gateway. The caller supplies
validated, owner-scoped evidence and a budgeted model function; this library
does not read credentials, call market providers, or write to a portfolio.

`conditional_logic.py` is adapted from `tradingagents/graph/conditional_logic.py`
in [TradingAgents](https://github.com/TauricResearch/TradingAgents), revision
`9fa1196fffbcfd9de5146d2dd2869df84ab99838`. Its import of the upstream agent
state is replaced with a dictionary type to avoid unrelated dependencies. The
rest of this workflow is newly written for the application's Vietnamese-market
scope; the prompts deliberately do not use upstream trade sizing or order
instructions. TradingAgents is distributed under the Apache 2.0 license, included
in this directory.

Run the offline workflow tests with `python3 -m unittest discover -s investment-research-worker`.
