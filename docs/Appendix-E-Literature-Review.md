# Appendix E — Literature Review

**S-AI SoulBot v3.0.0**

The findings below are the research basis for the shipped design decisions. The most
consequential one for code is the pattern layer: the literature is unambiguous that
stealth is not achievable, so `core/pattern` is built to be *unable* to attempt it —
authorized sessions only, measured parameters only, bounded delays (FR-025–027).

## E.1 Research Domains

| Domain | Key Finding | SoulBot Integration |
|---|---|---|
| Keystroke Dynamics | Duration, latency, timing entropy identify individuals | BehavioralSignature keystroke cadence (FR-022) |
| Mouse Dynamics | Six features achieve 93% bot-detection accuracy | Bezier paths, Fitts's-law velocity (FR-025–027) |
| Bot Detection | Escalating arms race; stealth is detectable | Authorized-session operation only (FR-025) |
| Human-Like Agents | Visual attributes influence decisions (VAF) | PatternGenerator modulation bounds |
| Personality Computing | Behavioral data more stable than text | Signature over psychometric inference (FR-023) |
| Drift Resilience | Separate detection from adaptation (DRDE) | Sentinel as sole authority (FR-008) |
| Delegation Ethics | Replacement produces resistance | Delegation model: acts for, never as (FR-018) |

## E.2 Key References

1. **WEBSIGHT: A Vision-First Architecture for Robust Web Agents.** arXiv:2508.16987.
2. **Bot Detection Techniques: Keystroke and Mouse Dynamics.** ACM DL.
3. **ScrapeOps: Anti-Bot Cost Escalation Staircase.** GitHub: TheWebScrapingClub.
4. **Adaptation Governance for Drift-Resilient Continuous Authentication.** IEEE Xplore, 2026.
5. **A Comparative Survey of Personality Trait Prediction Using Digital Footprints.** IJRASET, 2025.
6. **How do Visual Attributes Influence Web Agents?** arXiv:2601.21961.
7. **Mouse Pointing Endpoint Prediction to Distinguish Between Human and Bot.** HCI International 2025.
8. **AI-based Behavioral Biometrics for Enhanced Authentication in Mobile Banking.** IEEE Xplore, 2025.
9. **Personality Computing: New Frontiers in Personality Assessment.** Wiley Compass.
10. **WebWalker: Benchmarking LLMs in Web Traversal.** Semantic Scholar.
11. **Lightweight Bot Detection via Heuristic-Based Behavioural and CAPTCHA Integration.** Semantic Scholar, 2025.
12. **Behavioral Biometrics as a Security Signal.** ICOAEF-XV, 2026.
13. **Anti-Bot Mechanisms vs. Web Agents.** arXiv:2606.30119.
14. **A Systematic Literature Review on Biometric Authentication in Mobile Banking.** F1000Research, 2026.
15. **Behavioural Analytics and UK National Security.** CETaS Turing Institute.

## E.3 How the findings became requirements

| Finding | Requirement |
|---|---|
| Stealth is detectable → do not attempt it | FR-025 (authorized sessions only), FR-026 (bounded human-band delays) |
| Keystroke/mouse dynamics identify individuals → the signature is the identity signal | FR-022, FR-023 (measured only), JG-021/JG-022 (own pace, borrowed sandals) |
| Behavioural data is more stable than text → measure how the subject works, not what they like | FR-023; Signature panel has no autofill control (FR-054) |
| Detection and adaptation must be separate authorities → the Sentinel is the sole authorization authority | FR-008, §6.1 |
| Replacement produces resistance → the Bridge Rule refuses dependence | FR-015–017 |