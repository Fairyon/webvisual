var path = require('path'),
	_    = require('underscore');

module.exports = function(grunt) {
	var pkg  = grunt.file.readJSON('package.json'),
		// Important paths
		source = './public-src',
		depend = './public-dep',
		target = './public';

	function minifyFilter(src) {
		var dir  = path.dirname(src),
			type = path.extname(src),
			file = path.basename(src, type);

		// console.log(src, dir, type, file);

		// Use already minified versions, if they are available
		return !(grunt.file.exists(dir, file+'.min'+type));
	}

	// Project configuration.
	grunt.initConfig({
		pkg: pkg,
		// Just copy the not minified files
		copy: {
			"development-css": {
				files: [
					{
						expand: true,
						cwd: depend+'/css/',
						src: [ '**/*.css', '!**/*min.css' ],
						dest: target+'/css/'
					},
					{
						expand: true,
						cwd: source+'/css/',
						src: [ '**/*.css', '!**/*min.css' ],
						dest: target+'/css/'
					}
				]
			},
			"development-js": {
				files: [
					{
						expand: true,
						cwd: depend+'/js/',
						src: [ '**/*.js', '!**/*min.js' ],
						dest: target+'/js/'
					},
					{
						expand: true,
						cwd: source+'/js/',
						src: [ '**/*.js', '!**/*min.js' ],
						dest: target+'/js/'
					}
				]
			},
			"production-css": {
				files: [
					{
						expand: true,
						cwd: depend+'/css/',
						src: '**/*min.css',
						dest: target+'/css/'
					},
					{
						expand: true,
						cwd: source+'/css/',
						src: '**/*min.css',
						dest: target+'/css/'
					}
				]
			},
			"production-js": {
				files: [
					{
						expand: true,
						cwd: depend+'/js/',
						src: [
							'**/*min.js',
							// Foundation vendor stuff
							'vendor/*.js'
						],
						dest: target+'/js/'
					},
					{
						expand: true,
						cwd: source+'/js/',
						src: '**/*min.js',
						dest: target+'/js/'
					}
				]
			}
		},
		// Clean the directories
		clean: {
			// Delete the minified versions
			development: {
				src: [
					target+'/**/*min.*'
				]
			},
			// Delete the not minified versions
			production: {
				src: [
					target+'/**/*.css',
					target+'/**/*.js',
					'!'+target+'/**/*min.*'
				]
			},
			empty: {
				src: [ target+'/**/*' ],
				filter: function(filepath) {
					return (grunt.file.isDir(filepath) && require('fs').readdirSync(filepath).length === 0);
				},
			}
		},
		// Minify css files
		cssmin: {
			combine: {
				files: [
					// Minify dependencies css and personal css
					{ src: [depend+'/css/**/*.css', '!'+depend+'/css/**/*min.css'], dest: target+'/min/depend.min.css' },
					{ src: [source+'/css/**/*.css', '!'+source+'/css/**/*min.css'], dest: target+'/min/personal.min.css' }
				]
			},
			seperate: {
				files: [
					{
						expand: true,
						cwd: source+'/css/',
						filter: minifyFilter,
						src: [ '**/*.css', '!**/*min.css' ],
						ext: '.min.css',
						dest: target+'/css/'
					}
				]
			}
		},
		open: {
			start: {
				app: 'node',
				path: './app.js'
			},
			view: {
				path: 'http://localhost:3000/'
			}
		},
		// Minify js files
		uglify: {
			seperate: {
				files: [
					// Minimized js files on their own
					{
						expand: true,
						cwd: source+'/js/',
						filter: minifyFilter,
						src: [
							'**/*.js',
							'!**/*.min.js'
						],
						ext: '.min.js',
						dest: target+'/js/'
					}
				]
			}
		}
	});

	// Load the plugins
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-cssmin');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-open');


	// Default task(s).
	grunt.registerTask('default', ['compile:development', 'open']);

	// Alias tasks
	// Copy
	grunt.registerTask('copy:development', [ 'copy:development-css', 'copy:development-js' ]);
	grunt.registerTask('copy:dev', 'copy:development');
	grunt.registerTask('copy:production', [ 'copy:production-css', 'copy:production-js' ]);
	grunt.registerTask('copy:prod', 'copy:production');

	// Special tasks

	// Build the whole thing
	grunt.registerTask('build', 'Builds the project.',
		function(env) {
			if(!env) env = 'dev';

			// Invalid argument
			if(!(env === 'dev' || env === 'development' || env === 'prod' || env === 'production')) {
				grunt.fail.warn("Invalid argument: "+env);
			}

			// Execute the tasks
			grunt.task.run(
				[
					'compile:'+env,
					'open'
				]
			);
		}
	);

	// Minify the .css and .js files
	grunt.registerTask('compile',
		"Compiles the .jade-files and copies .css- and .js-files into '+dist+'/.\n"+
		"Depending on the specified environment ('dev' or 'prod') the files get minified or not.",
		function(env) {
			if(!env) env = 'dev';

			// No argument given
			if(!env) {
				grunt.fail.warn("You have to specify the environment: 'dev' or 'prod'");
			}

			var tasks = [];

			// Check which environment was specified and add the subtask; ends the execution if a wrong environment got specified
			if(env === 'dev' || env === 'development') {
				// Add the necessary tasks
				tasks.push(
					'clean:development',
					'copy:development',
					'clean:empty'
				);
			} else if(env === 'prod' || env === 'production') {
				// Add the necessary tasks
				tasks.push(
					'clean:production',
					'cssmin',
					'uglify',
					'copy:production',
					'clean:empty'
				);
			} else {
				grunt.fail.warn("Invalid argument: "+env);
			}

			// Run the tasks
			grunt.task.run(tasks);
		}
	);

};