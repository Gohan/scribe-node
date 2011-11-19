(function() {
  var env, root, scribe, services;

  root = typeof exports !== "undefined" && exports !== null ? exports : this;

  scribe = require('../scribe').load(['GoogleApi', 'GoogleApi2']);

  env = process.env;

  services = {};

  services['analytics'] = {
    'provider': scribe.GoogleApi,
    'key': env.HUBOT_GOOGLE_OAUTH_API_KEY,
    'secret': env.HUBOT_GOOGLE_OAUTH_API_SECRET,
    'scope': 'https://www.google.com/analytics/feeds/',
    'callback': 'oob'
  };

  services['analytics2'] = {
    'provider': scribe.GoogleApi2,
    'key': env.HUBOT_GOOGLE_OAUTH2_API_KEY,
    'secret': env.HUBOT_GOOGLE_OAUTH2_API_SECRET,
    'scope': 'https://www.googleapis.com/auth/analytics.readonly',
    'callback': 'urn:ietf:wg:oauth:2.0:oob'
  };

  root.Hubot = (function() {

    function Hubot() {}

    Hubot.prototype.create_service = function(api) {
      var service;
      if (service = services[api]) {
        return new scribe.ServiceBuilder().provider(service['provider']).apiKey(service['key']).apiSecret(service['secret'])._callback(service['callback'])._scope(service['scope']).build();
      } else {
        return false;
      }
    };

    Hubot.prototype.init_robot_brains = function(robot, api) {
      if (!robot.brain.data.oauth) {
        robot.brain.data.oauth = [];
        robot.brain.data.oauth[api] = [];
      } else if (!robot.brain.data.oauth[api]) {
        robot.brain.data.oauth[api] = [];
      }
      return robot.brain.data.oauth[api];
    };

    Hubot.prototype.get_authorization_url = function(robot, msg, api) {
      var brains, request_token_extract, service, url;
      if (service = this.create_service(api)) {
        brains = this.init_robot_brains(robot, api);
        if (service.getVersion() === "2.0") {
          url = service.getAuthorizationUrl();
          return msg.send("Authorization url: " + url);
        } else {
          request_token_extract = function(response) {
            var token;
            console.log('Response: ' + response.data);
            token = service.api.getRequestTokenExtractor()(response.data);
            url = service.getAuthorizationUrl(token);
            msg.send("Authorization url: " + url);
            brains['request_token'] = token.getToken();
            brains['request_secret'] = token.getSecret();
            return console.log("Request token set: " + brains['request_token']);
          };
          return service.getRequestToken(request_token_extract);
        }
      } else {
        return msg.send("Api not found: " + api);
      }
    };

    Hubot.prototype.get_request_token = function(robot, api) {
      return new scribe.Token(robot.brain.data.oauth[api]['request_token'], robot.brain.data.oauth[api]['request_secret']);
    };

    Hubot.prototype.get_verifier = function(robot, api) {
      return new scribe.Verifier(robot.brain.data.oauth[api]['code']);
    };

    Hubot.prototype.set_access_token = function(robot, msg, api, service) {
      var access_token_extract, brains;
      brains = this.init_robot_brains(robot, api);
      access_token_extract = function(response) {
        var token;
        console.log('Response: ' + response.data);
        token = service.api.getAccessTokenExtractor()(response.data);
        if (brains['access_token'] = token.getToken()) {
          console.log('Access token set: ' + brains['access_token']);
          if (service.getVersion() === "2.0") {
            brains['expires_in'] = token.getExpires();
            brains['token_type'] = token.getType();
            brains['refresh_token'] = token.getRefresh();
          } else {
            brains['access_secret'] = token.getSecret();
          }
          return msg.send("Access token set");
        } else {
          return msg.send("Access token could not be set. Please try to refresh or get a new authorization by url.");
        }
      };
      if (service.getVersion() === "2.0") {
        return service.getAccessToken(this.get_verifier(robot, api), access_token_extract);
      } else {
        return service.getAccessToken(this.get_request_token(robot, api), this.get_verifier(robot, api), access_token_extract);
      }
    };

    Hubot.prototype.set_verification_code = function(robot, msg, api) {
      var brains, code, service;
      brains = this.init_robot_brains(robot, api);
      if (service = this.create_service(api)) {
        if (service.getVersion() === "1.0" && !brains['request_token']) {
          return msg.send("Please get authorization url and request token first");
        } else if (code = msg.match[2]) {
          brains['code'] = code;
          msg.send('Verification code set: ' + brains['code']);
          return this.set_access_token(robot, msg, api, service);
        } else {
          return msg.send("Verification code not found");
        }
      } else {
        return msg.send("Api not found: " + api);
      }
    };

    Hubot.prototype.get_access_token = function(robot, msg, api) {
      var brains, service;
      brains = this.init_robot_brains(robot, api);
      if (brains['access_token'] && (service = this.create_service(api))) {
        if (service.getVersion() === "2.0") {
          return new scribe.Token(brains['access_token'], "", "", brains['expires_in'], brains['token_type'], brains['refresh_token']);
        } else {
          return new scribe.Token(brains['access_token'], brains['access_secret']);
        }
      } else {
        msg.send("Access token not set for api: " + api + ". Please set verification code or get authorization url.");
        return false;
      }
    };

    Hubot.prototype.refresh_token = function(robot, msg, api) {
      var access_token, brains, refresh_token_extract, service;
      if (service = this.create_service(api)) {
        if (service.getVersion() === "2.0") {
          access_token = this.get_access_token(robot, msg, api);
          brains = this.init_robot_brains(robot, api);
          refresh_token_extract = function(response) {
            var refresh_token;
            console.log('Response: ' + response.data);
            refresh_token = service.api.getAccessTokenExtractor()(response.data);
            access_token.updateToken(refresh_token);
            brains['access_token'] = access_token.getToken();
            brains['expires_in'] = access_token.getExpires();
            console.log("Refreshed token: " + brains['access_token']);
            return msg.send("Token refreshed");
          };
          return service.getRefreshToken(access_token, refresh_token_extract);
        } else {
          return msg.send("Only OAuth 2.0 tokens can be refreshed.");
        }
      } else {
        return msg.send("Api not found: " + api);
      }
    };

    return Hubot;

  })();

}).call(this);
