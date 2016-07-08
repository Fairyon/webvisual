'use strict';
/*
 * Module dependencies
 */
const express = require('express'),
  fs = require('fs'),
  path = require('path'),
  EventEmitter = require('events').EventEmitter,
  // DATA-MODULE
  dataModule = require('./data_module'),
  // Routing
  xFrameOptions = require('x-frame-options'),
  session = require('express-session'),
  passport = require('passport'),
  bodyParser = require('body-parser'),
  cookieParser = require('cookie-parser'),
  Router = require('./routes/index.js');

// Config Object
var config = {},
  isRunning = false,
  httpsServer,
  httpServer,
  router,
  configurations,
  dataHandler;

// *** Routing ***
const app = express(),
  httpApp = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(cookieParser()); // read cookies (needed for auth)
app.use(bodyParser.urlencoded({
  extended: true
})); // get information from html form
app.use(bodyParser.json());

app.use(session({
  secret: '&hkG#1dwwh!',
  resave: false,
  saveUninitialized: false
}));

// Prevent Clickjacking
app.use(xFrameOptions());
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public', 'www')));

class WebvisualServer extends EventEmitter {

  constructor(settings) {
    super();
    this.setConfig(settings);
  }
  setConfig(settings) {
    if (!settings) return;

    config = settings;

    if (isRunning)
      this.disconnect();

    router = new Router(app, passport, config.server, configurations); // load our routes and pass in our app and fully configured passport

    // Routing to https if http is requested
    httpApp.get('*', function(req, res, next) {
      res.redirect('https://' + req.headers.host + ':' + config.server.port.https + req.path);
    });

    // Configure SSL Encryption
    var sslOptions = {
      port: config.server.port.https,
      key: fs.readFileSync(__dirname + '/ssl/ca.key', 'utf8'),
      cert: fs.readFileSync(__dirname + '/ssl/ca.crt', 'utf8'),
      passphrase: require('./ssl/ca.pw.json').password,
      requestCert: true,
      rejectUnauthorized: false
    };

    try {
      // Read files for the certification path
      var cert_chain = [];
      fs.readdirSync(__dirname + '/ssl/cert_chain').forEach(function(filename) {
        cert_chain.push(
          fs.readFileSync(__dirname + '/ssl/cert_chain/' + filename, 'utf-8'));
      });
      sslOptions.ca = cert_chain;
    } catch (err) {
      console.warn('Cannot open "/ssl/cert_chain" to read Certification chain');
    }

    /*
     * Server
     */

    httpsServer = require('https').createServer(sslOptions, app);
    httpServer = require('http').createServer(httpApp);

    // if Error: EADDRINUSE --> log in console
    httpServer.on('error',
        function(e) {
          if (e.code == 'EADDRINUSE') {
            console.log('Port ' + config.server.port.http + ' in use, retrying...');
            console.log(
              'Please check if \'node.exe\' is not already running on this port.');
            httpServer.close();
            setTimeout(function() {
              httpServer.listen(config.server.port.http);
            }, 5000);
          }
        })
      .once('listening', function() {
        console.log('HTTP Server is listening for redirecting to https on port %d in %s mode', config.server.port.http,
          app.settings.env);
      });
    httpsServer.on('error',
        function(e) {
          if (e.code == 'EADDRINUSE') {
            console.log('Port ' + config.server.port.https + ' in use, retrying...');
            console.log(
              'Please check if \'node.exe\' is not already running on this port.');
            httpsServer.close();
            setTimeout(function() {
              httpsServer.listen(config.server.port.https);
            }, 5000);
          }
        })
      .once('listening', function() {
        console.log('HTTPS Server is listening on port %d in %s mode', config.server.port.https,
          app.settings.env);
      });
    dataHandler = new dataModule(httpsServer);
    dataHandler.on('change', function(configurations) {
      if(configurations['HNF-GDS']) {
        Router(app, passport, config.server, configurations['HNF-GDS'].configuration); // load our routes and pass in our app and fully configured passport
      }
    });
  }

  connect(settings) {
    if (settings)
      config = settings;
    // connect the DATA-Module
    if (!isRunning) {
      console.log('WebvisualServer is starting');
      dataHandler.connect(config.userConfigFiles);
      httpServer.listen(config.server.port.http);
      httpsServer.listen(config.server.port.https);
      isRunning = true;
      this.emit("server-start");
    }
  }

  disconnect() {
    console.log('WebvisualServer is closing');
    httpServer.close();
    httpsServer.close();
    dataHandler.disconnect();
    isRunning = false;
    this.emit("server-stop");
  }

  reconnect(settings) {
    if (settings)
      config = settings;
    if (isRunning)
      this.disconnect();
    setTimeout((function() {
      this.connect();
    }).bind(this), 3000);
  }

  toggle(settings) {
    if (settings)
      config = settings;
    if (isRunning)
      this.disconnect();
    else
      this.connect();
  }
};

module.exports = WebvisualServer;
