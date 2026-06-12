local claims = std.extVar('claims');

{
  identity: {
    traits: {
      // Yandex returns an access_token (no id_token); Kratos calls the Yandex
      // userinfo endpoint and exposes the result here. Yandex has no
      // `email_verified` field. Email may be empty if the scope was denied.
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'first_name' in claims then 'first' else null]: claims.first_name,
        [if 'last_name' in claims then 'last' else null]: claims.last_name,
      },
    },
  },
}
