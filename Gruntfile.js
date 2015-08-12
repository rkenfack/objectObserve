//http://www.html5rocks.com/en/tutorials/tooling/supercharging-your-gruntfile/?redirect_from_locale=de

module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');


  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    shell: {
      source: {
        command: 'jspm bundle-sfx lib/objectobserve  dist/objectobserve.js'
      },
      min: {
        command: 'jspm bundle-sfx lib/objectobserve  dist/objectobserve.min.js --minify'
      },
      test: {
        command: 'jspm bundle-sfx test/test + test/run dist/test.js'
      },
      "test-min" : {
        command: 'jspm bundle-sfx test/test + test/run dist/test.min.js --minify'
      }
    },

    jshint: {
      options: {
        esnext : true,
        curly: true,
        browser: true,
        ignores : [
          'lib/observe-js.js'
        ]
      },
      src: ['lib/**/*.js']
    },

    clean : {
      build : ['dist/**/*']
    }

  });

  grunt.registerTask('source', ['jshint', 'shell:source']);
  grunt.registerTask('min', ['jshint', 'shell:min']);
  grunt.registerTask('test', ['shell:test']);
  grunt.registerTask('test-min', ['shell:test-min']);
  grunt.registerTask('build', ['clean:build', 'jshint', 'shell:source', 'shell:min', 'test', 'test-min']);


}