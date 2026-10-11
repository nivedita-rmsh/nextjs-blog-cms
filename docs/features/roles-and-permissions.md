# Roles and Permissions

| Role   | Access                                          |
| ------ | ----------------------------------------------- |
| Admin  | Full control (users, posts, roles, comments, developer settings) |
| Author | Create and manage own posts, delete own comments |

Session clients enforce Supabase RLS. Service-role clients bypass RLS and must perform explicit authentication, ownership and role checks. Authors also manage their own developer API and provider keys.

Public email/password, Google, and GitHub signup all use the database default `author` role with immediate author access, including publishing (subject to publication checks). There is no pending-contributor approval state; issue #111 tracks any future invitation/approval policy. Provider names, avatars, and editable user metadata never assign roles. Existing linked identities retain their user ID and database role. See [social authentication](../setup/social-auth.md) for identity and MFA behavior.
