# FYP operational gap improvements

Use the existing MSI development worktree. Complete each change with a failing regression, the smallest local implementation and fresh verification. Verify affected workflows against the loopback Firebase stack sequentially. Keep the live checkout and its services separate.

## Ordinary expected incoming

- Extend `backend/functions/purchaseOrderWorkflow.mjs` to prepare the ordinary expected-incoming read and validated projection before any writes. Write the record alongside the order, event and receipt effects on Issue or Receive. Use the existing `expectedReplenishments/{purchaseOrderId}` boundary, with an explicit ordinary origin. Leave the demo lineage format intact.
- Derive multi-line balances from the order. The persisted record binds the order version and purchase event. Receipt retries, stale versions, duplicate notes and inconsistent existing incoming records cannot change stock twice. For a pre-change issued or partially received order, create its missing incoming record when the next receipt commits, carrying forward recorded received units.
- Extend the existing Expected incoming tab and report projection to display both forms. Keep the demo evidence label and distinguish manual orders without a reorder link.
- Extend `scripts/purchase-order-workflow-qa.mjs` for issue, partial and full receipt, historical adoption, mismatch and rollback. Run the existing demo procurement, record creation and report regressions.

## Manual references

- In the trusted stock workflow, bind a nonblank manual reference to the scope, product and movement type. Check exact operation receipt recovery first. Use a transactionally held reference key for new requests and a bounded check for normalized historical duplicates.
- Retain the claim after completion, and release only its pending request on rejection. Preserve blank references and independent procurement/warehouse lineage. Use distinct manual references for separate physical deliveries. Exercise retry, reference collision, independent approval and correction paths.

## Fleet eligibility

- Reuse the existing fleet forms and transport transactions. Retain optional driver licence and vehicle inspection/insurance expiry dates alongside the existing maintenance due date. Evaluate the recorded dates in Malaysia time against planned and actual departure as appropriate. Keep legacy missing values visible as unknown.
- Use one eligibility check across scheduling, reassignment and dispatch. Verify expired and due-date boundaries, recorded and missing dates, existing assignment locks and failed-transaction preservation.

Update the functional requirements audit and user-facing workflow notes after verification. Record class matching and other report requirements that lack dependable inputs. Stage reviewed source and documentation only, then run secret checks before pushing to the private repository.
