Options in the config.json-file:

	The path to the file which should be readed
	read_file: STRING

	The path to the file where the commands should be written
	command_file: STRING

	The port on which the server runs
	port: NUMBER

	An object with some commands that can be written in the commandFile
	cmd: OBJECT
		The command to to interrupt the data flow
		interrupt: STRING

 		The command to continue the data flow
 		continue: STRING
  }