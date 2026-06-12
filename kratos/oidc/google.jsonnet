local claims = std.extVar('claims');

// Google is used here for LINKING to an existing username/password identity
// (account linking via the settings flow), not for creating accounts. The
// identity schema has no `email` trait and `username` is the existing
// identifier, so we only map the optional name fields to avoid schema
// validation errors. The linked token is stored by Kratos in the identity's
// oidc credential regardless of this mapping.
{
  identity: {
    traits: {
      name: {
        [if 'given_name' in claims then 'first' else null]: claims.given_name,
        [if 'family_name' in claims then 'last' else null]: claims.family_name,
      },
    },
  },
}
