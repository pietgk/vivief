# Intent: Create a review of the current state of vivief as a review

**Status**: Open — ongoing way-of-working-challenge

## The problem

optaining a reviewed by claude and me (piet) of the current state of vivief documentation.

## Current approach

we organised the vivief docs into a llm and human friendly way.
  
latest review status 

docs/contract/concepts-quick-ref.md — Retitled as "DevAC Domain Quick Reference" with platform cross-reference

CLAUDE.md — Added vivief platform pointer under Project Overview

docs/README.md — Three additions:
  - "New here?" onboarding sequence
  - Domain-specific entry points (Counseling, Procurement) + REVIEW.md link in routing table
  - DevAC ↔ vivief bridge table with terminology evolution note
  - Documentation maintenance guide (naming, lifecycle, folder rules)

docs/claude/INDEX.md — Claude window creation guide with template and rules

docs/contract/vivief-concepts-impl-kb.md — Advanced/Deferred phases labeled as "not near-term" and "revisit when triggers are met"

docs/REVIEW.md — All 7 issues, 9 broken references, 4/5 omissions, and 1/3 trim items marked as fixed. Overall grade upgraded to A. Only remaining items: 

full document index (open) and last-reviewed dates (ongoing)

## my feedback points:

the target storage mentions hypercore and maybe more of the holepunch stack.
that was the previous target and it contained good ideas but later we found iroh and MoQ as a much better solution.
Interview me relentlessly about every aspect that needs clarification in this prompt before creation the plan to update the docs with this corrected in a clean way.
Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.
