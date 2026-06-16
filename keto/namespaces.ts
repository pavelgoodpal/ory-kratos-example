// Ory Keto namespaces (Ory Permission Language).
//
// A Car has `owners`. Ownership is single-owner by app convention (the backend
// removes the previous owner tuple on transfer), but the namespace itself just
// models the relation. We check `Car:<carId>#owners@<userIdentityId>`.

import { Namespace } from "@ory/keto-namespace-types"

class User implements Namespace {}

class Car implements Namespace {
  related: {
    owners: User[]
  }
}
