# Spark — web client

Static front end for Spark, served from GitHub Pages at <https://t4meri.github.io>.

It talks to the Spark API on a different origin, so the session is held as a bearer token in
`localStorage` rather than a cookie. Third-party cookies are blocked by Safari and by Chrome
whenever the user turns them off, which would otherwise break sign-in.

`config.js` holds the API origin. Everything else in this repository is the same front end the
API serves for itself.
