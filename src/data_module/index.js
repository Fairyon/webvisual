'use strict';

// Module exports
module.exports = {
  connect: connect,
  disconnect: disconnect
};

var // ASYNC <-- one callback for a lot of async operations
async = require('async'),
  // custom: DATAMODULE
  filehandler = require('./filehandler'),
  // custom: mailer
  mailer = new require('./mail')('exceeds'),
  // FS <-- File System
  fs = require('fs'),

  /* Database Server + Client */
  dbController = new require('./database')(),

  /* Class variables */
  threshold = filehandler.threshold, // extension: of DATAMODULE
  dataFileHandler = filehandler.dataFileHandler, // extension: of DATAMODULE
  dataMerge = filehandler.dataMerge, // extension: of DATAMODULE
  configHandler = require('./configuration'), // extension: of DATAMODULE
  Client = require('./clients'), // extension: of DATAMODULE

  /* Current connected clients */
  clients = {},
  // array of configurations
  configArray = [];

// private function to handle the errors
function handleErrors(errors, id_message) {
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

  var io = require('socket.io').listen(server);

  // TODO: Test for an array of configurations
  configArray = config.configurations;

  // dataFileHandler - established the data connections
  var dataLabels = [];
  var indexOfLabel = {};
  var dataConf = [];
  var dataFile = [];

  for (var i = 0; i < configArray.length; i++) {
    var label = configArray[i].label;
    // labels (database names) are unique
    if (dataLabels.indexOf(label) != -1)
      throw new Error('Multiple occurrences of Label: "' + label + '"\n' +
        'Database Names needs to be unique!!')

    dataLabels.push(label);

    indexOfLabel[label] = i;
    dataConf.push(configHandler.arrangeTypes(label, i, configArray[i].locals));

    dataFile.push(new dataFileHandler({
      index: i,
      // Object used the Configuration
      connection: configArray[i].connections,
      listener: {
        error: function(type, err, err_index) {
          // dataSocket.emit('mistake', { error: err, time: new Date() });
          handleErrors(err, "dataFileHandler");
        },
        data: function(type, data, labelIndex) {
          if (!data || data.length == 0)
            return; // Don't handle empty data

          // Process data to certain format
          var currentData = dataMerge(dataConf[labelIndex], {
            exceeds: threshold(data, dataConf[labelIndex].types),
            data: data
          });

          // Save new Data in Database
          dbController.appendData(
            labelIndex, currentData.content,
            function(appendedData, cb_index) {
              // for (var socketId in clients) {
              //   // console.log(socketId + ' ' + (new Date()).toLocaleTimeString());
              //   clients[socketId].socket.emit('data', {
              //     label: dataLabels[labelIndex],
              //     content: appendedData,
              //     time: new Date(), // current message time
              //   });
              // }
            });
        }
      }
    }));
  }

  // configuration ordering
  var configuration = {
    groupingKeys: {},
    dataStructure: [],
    paths: {},
    preferedGroupingKeys: {},
    labels: dataLabels,
    indexOfLabel: indexOfLabel,
    svgSources: []
  };
  for (var i = 0; i < dataConf.length; i++) {
    var label = dataLabels[i];
    configuration.groupingKeys[label] = dataConf[i].groupingKeys;
    configuration.paths[label] = dataConf[i].paths;
    configuration.preferedGroupingKeys[label] = dataConf[i].preferedGroupingKey;
    configuration.dataStructure.push({
      label: label,
      groups: dataConf[i].groups
    });
    for (var j = 0; j < dataConf[i].svgSources.length; j++) {
      if (configuration.svgSources.lastIndexOf(dataConf[i].svgSources[j]) == -1)
        configuration.svgSources.push(dataConf[i].svgSources[j]);
    }
  }

  // Data Socket
  var dataSocket = io.of('/data');

  // Handle connections of new clients
  dataSocket.on('connection', function(socket) {

    socket.emit('clientConfig', configuration, socket.id);

    socket.on('clientConfig', function(options) {

      var current_client = new Client(socket, options);

      console.log(socket.id);
      // io.clients(function(error, clients) {
      //   if (error) throw error;
      //   console.log(clients); // => [6em3d4TJP8Et9EMNAAAA,
      //   G5p55dHhGgUnLUctAAAB]
      // });

      // go through all patterns and collect the data, the client needs
      async.map(current_client.patterns,
        function(pattern, async_callback) {
          if (indexOfLabel[pattern.label] === undefined) {
            // Client asks for nonexistent label
            console.log(JSON.stringify(pattern));
            handleErrors(
              new Error("label: " + pattern.label + " is undefined"));
            return;
          }
          // use firstPattern to look for the data in corresponding
          // database
          // first argument is the index of database to query
          dbController.getData(indexOfLabel[pattern.label],
            pattern.firstPattern,
            function(data, index) {
              var message_chunk = {
                label: dataLabels[index],
                content: data
              }
              async_callback(null, message_chunk);
            });
        },
        // 'message' is an array of all 'message_chunk's
        function(errors, message) {
          if (errors) {
            handleErrors(errors, "async on client connection");
            if (message === undefined)
              return;
          }
          socket.emit('first', message);

          // append the client to array after the first message is sent
          current_client.hasFirst = true;
          clients[socket.id] = current_client;
        });

      // if client is disconnected, remove them from list
      socket.on('disconnect',
        function() {
          delete clients[socket.id];
        }
      );
    });
  });

  io.of('/data').clients(function(error, clients) {
    if (error) {
      throw error;
      console.log(clients); // => [PZDoMHjiu8PYfRiKAAAF, Anw2LatarvGVVXEIAAAD]
    }
  });

  // Function to serve the clients with new data each updateIntervall of time
  // updateIntervall is the time interval in milliseconds
  var serve_clients_with_data = function(updateIntervall) {
    // Send new data on constant time intervals
    setInterval(function() {
      // for every label, switch the representing temporary database
      dataLabels.forEach(function(label, i) {
        dbController.switchTmpDB(i, function(tmpDB, tmp_index) {
          if (!tmpDB)
            return; // tmpDB is undefined

          // look if clients need data from the switched temporary database
          async.each(clients,
            function(client, async_callback) {
              var search_pattern;
              client.patterns.forEach(function(pattern) {
                // look if that client have a pattern with that label
                if (pattern.label === dataLabels[tmp_index])
                  search_pattern = pattern.appendPattern;
              });
              if (search_pattern === undefined)
                async_callback();

              dbController.getDataFromTmpModel(
                tmp_index, tmpDB, search_pattern,
                function(data, labelIndex) {

                  if (!data || data.length < 1) {
                    // data is empty
                    return;
                  }

                  // one message per one tmpDB
                  var message = {
                    label: dataLabels[labelIndex],
                    content: data,
                    time: new Date(), // current message time
                  };
                  client.socket.emit('data', message);

                  async_callback();
                });
            },
            function(err) {
              if (err)
                handleErrors(err);
              // cleanize the tmpDB with current label
              // IMPORTANT! tmpDB need to be cleanized each time
              // otherwise you'll get endless number of useless data
              tmpDB.remove({},
                function(err) {
                  if (err)
                    handleErrors(err);
                });
            });
        });
      })
    }, updateIntervall);
  };

  /*
   * Get SERVER.io, mongoose and server running!
   */
  // define Listeners to catch all events after connection to the mongoDB
  dbController.on('error',
    function(err) {
      handleErrors(err, "dbController");
    });

  async.forEachOf(
    configArray,
    function(config, index, async_callback) {
      config.database.name = config.label;
      config.database.device_properties = config.locals.unnamedType;
      dbController.createConnection(
        config.database, index,
        function(labelIndex_cb1) {
          // cb1 = "callback 1"
          dbController.connect(labelIndex_cb1, function(labelIndex_cb2) {
            // register the properties of devices in the database
            dbController.setDevices(labelIndex_cb2,
              dataConf[labelIndex_cb2].types,
              function() {});

            // start the handler for new measuring data related to
            // configArray[i]
            dataFile[labelIndex_cb2].connect();

            /* use next line only to remove all the TMPs
             * make sure, there is no connection to the filehandler
             * and clients will not be served at the time of removement */
            // dbController.removeTMPs(labelIndex_cb2);

            // configArray[i].database is connected
            async_callback();
          });
        });
    },
    // call after all databases are connected
    function(err) {
      if (err)
        handleErrors(err, "async(configArray)");

      // make the Server available for Clients
      server.listen(config.port);

      serve_clients_with_data(config.updateIntervall);
    });

  /*
   * Start Mail Server
   */

  // mailer.startDelayed(function(error,info){
  //   if(error){
  //     console.log('Mailing error: ' + error);
  //   }
  //   else{
  //     if (info.response) console.log('E-Mail sent: ' + info.response);
  //     else{
  //       for( var i in info.pending[0].recipients[0]) console.log(i);
  //       console.log('E-Mail sent: ' + info.pending[0].recipients[0]);
  //     }
  //   }
  // });
}

function disconnect() {
  dbController.disconnect();
  dbController.remove();
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
