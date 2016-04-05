'use strict';

// Module exports
module.exports = {
  connect: connect,
  disconnect: disconnect
};

var ioServer = require('socket.io'),
  io,
  dataSocket,
  // custom: DATAMODULE
  filehandler = require('./filehandler'),
  // custom: mailer
  mailer = new require('./mail')('exceeds'),

  /* Class variables */
  dataFileHandler = filehandler.dataFileHandler, // extension: of DATAMODULE
  mergeData = filehandler.dataMerge, // extension: of DATAMODULE
  svgSources,

  // currentData temporary saved for the first sending (unnecessary with db requests)
  currentData = {},
  dataFile = {},
  configuration,
  connection,
  dataConfig;

// private function to handle the errors
function handleErrors(errors, id_message) {
  console.log("error");
  if (errors === undefined)
    return;
  if (_.isArray(errors)) {
    errors.forEach(function(err) {
      handleErrors(err, id_message)
    });
    return;
  }
  if (id_message === undefined)
    id_message = "";
  else
    id_message += ": ";
  // similar to JSON.stringify(), but shows more information
  var output = id_message + require('util').inspect(errors) + "\n";
  if (errors.stack !== undefined)
    output += errors.stack + "\n";
  console.warn(output);
}

function connect(config, server, err) {

  if (server == undefined || config == undefined) {
    //    err.msg = "No valid configuration file"
    return; // Check the Existence
  }
  // initMailer(config.mail);
  /*
   * Configure SOCKET.IO (watch the data file)
   */
  io = new ioServer();
  io.listen(server);
  dataSocket = io.of('/data');

  configuration = config.configuration;
  dataConfig = config.dataConfig;
  connection = config.connection;

  // dataFileHandler - established the data connections
  var mergedData;

  for (var label of configuration.labels) {

    var listeners = {
      error: function(type, err, label) {
        // dataSocket.emit('mistake', { error: err, time: new Date() });
        handleErrors(err, "dataFileHandler label: " + label);
      },
      data: function(type, data, label) {
        if (!data || data.length == 0)
          return; // Don't handle empty data
        // temporary save data
        if (dataConfig[label]) {
          // process data
          mergedData = mergeData(dataConfig[label], data);
          // serve clients in rooms for labels
          // only newer data is send
          // TODO: handle this optional by config
          if (currentData[label] && mergedData.date > currentData[label].date) {
            dataSocket.to(label).emit("update", mergedData);
          }
          currentData[label] = mergedData;
        }
      }
    };

    dataFile[label] = new dataFileHandler({
      label: label,
      connection: connection[label],
      listener: listeners
    });

    dataFile[label].connect();
  }

  // Handle connections of new clients
  dataSocket.on('connection', function(socket) {

    socket.emit('init', configuration);

    socket.on('init', function(config) {
      for (var label of config.labels) {
        socket.join(label); // client joins room for selected label
        socket.emit('update', currentData[label]);
      }
    });

    // socket.on('disconnect', function() {
    //   // leave rooms on disconnect
    //   var rooms = io.sockets.manager.roomClients[socket.id];
    //   for (var room in rooms) {
    //     socket.leave(room);
    //   }
    // });
  });

  io.of('/data').clients(function(error, clients) {
    if (error) {
      throw error;
      console.log('data-socket clients error', clients); // => [PZDoMHjiu8PYfRiKAAAF, Anw2LatarvGVVXEIAAAD]
    }
  });

  server.listen(config.port);
}

function serveData(label, content) {
  dataSocket.to(label).emit("update", content);
}

function disconnect() {
  if (dataFile && configuration && configuration.labels) {
    for (var label of configuration.labels) {
      if (dataFile[label]) {
        dataFile[label].close();
        delete dataFile[label];
      }
    }
  }
  io = null;
  dataFile = {};
}

function initMailer(config) {
  /*
   * Init mailer
   */
  mailer.init({
    from: config.from, // sender address
    to: config.to, // list of receivers
    subject: config.subject
  });
  mailer.setType('html');
  mailer.setDelay(1000);
}
