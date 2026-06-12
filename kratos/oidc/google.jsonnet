local claims = std.extVar('claims');

{
  identity: {
    traits: {
      // Google provides a verified email when the `email` scope is granted.
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'given_name' in claims then 'first' else null]: claims.given_name,
        [if 'family_name' in claims then 'last' else null]: claims.family_name,
      },
    },
  },
}
