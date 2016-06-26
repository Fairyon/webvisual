// Routing

module.exports = function(app, passport, config) {

  require('./passport_strategies/activedirectory.js')(passport, config.auth.ldap); // register custom ldap-passport-stategy
  require('./passport_strategies/dummy.js')(passport); // register dummy-stategy

  app.get('/', loggedIn, function(req, res) {
    res.get('X-Frame-Options'); // prevent to render the page within an <iframe> element
    res.render('index', {
      user: req.user,
      config: config.configuration,
      mobile: isMobile(req)
    });
    res.end();
  });

  app.get('/tests', loggedIn, function(req, res) {
    res.get('X-Frame-Options'); // prevent to render the page within an <iframe> element
    res.render('tests', {
      user: req.user,
      config: config.configuration,
      mobile: isMobile(req)
    });
    res.end();
  });

  app.get('/login', loggedIn, function(req, res) {
    if (config.auth.required === true) {
      res.render('login', {
        user: req.user,
        mobile: isMobile(req)
      });
    }
    else {
      res.render('index', {
        user: req.user,
        config: config.configuration,
        mobile: isMobile(req)
      });
    }
  });

  if (config.auth.required === true) {
    app.post('/login',
      passport.authenticate('activedirectory-login', {
        successRedirect: '/',
        failureRedirect: '/login'
      }),
      function(req, res) {
        // console.log("auth login");
      }
    );
  } else {
    app.post('/login',
      passport.authenticate('dummy', {
        successRedirect: '/',
        failureRedirect: '/'
      }),
      function(req, res) {}
    );
  }

  app.get('/404', function(req, res) {
    res.render('404');
  });

  app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
  });

  function loggedIn(req, res, next) {
    if (config.auth.required === false || req.user) {
      next();
    } else {
      res.redirect('/login');
    }
  }

  function isMobile(req) {
    var ua = req.header('user-agent');
    // console.log(ua);
    if (/mobile/i.test(ua) || /tablet/i.test(ua) || /android/i.test(ua))
      return true;
    else
      return false;
  }
}
