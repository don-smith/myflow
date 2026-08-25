# Order event runtime

The runtime accepts orders synchronously so callers receive an acknowledgement. Accepted orders are then published through a shared event contract. Analytics and scheduling consume those events independently. Source dependencies should point toward `contracts`; two-way request and acknowledgement traffic is an expected runtime interaction, not permission for source cycles.

Delivery is at least once. Consumers must tolerate duplicate event IDs. The in-memory bus is for this fixture only.
