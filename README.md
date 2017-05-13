Web app used to chat with several Twitch accounts at once.

Server is hosted using [NodeJS](http://nodejs.org/).

## Installation

Install as you would with any regular Node application.

## Setup

The project requires a **settings.json** file which contains your Twitch applications clientID, secret and more.

The file has to be in base directory of the project (can be changed in index.js) and must follow this template:

```
{
  "hostName": "<Where you host your web app>",
  "port": <Web app port>,
  "app": {
    "clientID": "<Your Twitch apps client ID>",
    "secret": "<Your Twitch apps secret>",
    "redirect_uri": "<Your Twitch apps redirect uri>"
  }
}
```

The redirect_uri is also the host route.

Here is an example of a complete **settings.json**:

```
{
  "hostName": "http://localhost",
  "port": 3000,
  "app": {
    "clientID": "uo6dggojyb8d6soh92zknwmi5ej1q2",
    "secret": "nyo51xcdrerl8z9m56w9w6wg",
    "redirect_uri": "/twitchauth"
  }
}
```

The application will create a **users.json** file (can be changed in index.js) which contains all the authorized accounts.

## Predefined users.json

If you already have Twitch usernames and authorization tokens, you can create your own **users.json** file which the application will load on start.

The **users.json** is an array and must follow this template:

```
[
  {
    "login": "<Twitch login in lowercase>",
    "token": "<Twith auth token for user>"
  },
  ...
]
```

## Logins

Usage of the application can be protected by a login screen. To add logins, you have to add an array to your **settings.json** file like this:


```
{
  ...
  "app": {
    ...
  },
  "logins": [
    "password1", "password2", ...
  ]
}
```

When logins are detected, you will meet a login screen before being able to interact with the bots automatically.

## Screenshot

![TwitchBots screenshot](http://i.imgur.com/wc9jafE.png)