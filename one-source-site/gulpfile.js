'use strict';
const path = require('path');
const gulp = require('gulp');
const $ = require('gulp-load-plugins')();
const runSequence = require('run-sequence');
const browserSync = require('browser-sync').create();
const browserify = require('browserify');
const watchify = require('watchify');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const MergeStream = require('merge-stream');
const rimraf = require('rimraf');
const projectRoot = '/project/';
const paths = {
  dest: 'dist',
  html: {
    baseDir: 'src/html',
    src: [
      'src/html/**/*.jade',
      '!src/html/partial/**/*.jade',
      '!src/html/layout.jade'
    ],
    watch: 'src/html/**/*.jade',
    dest: path.join('dist', projectRoot)
  },
  css: {
    src: [
      'src/css/**/*.scss',
      '!src/css/**/_*.scss'
    ],
    watch: 'src/css/**/*.scss',
    dest: path.join('dist', projectRoot, 'css')
  },
  js: {
    src: 'src/js/main.js',
    dest: path.join('dist', projectRoot, 'js')
  },
  img: {
    src: 'src/img/**/*.{gif,jpg,png,svg}',
    watch: 'src/img/**/*.{gif,jpg,png,svg}',
    dest: path.join('dist', projectRoot, 'img')
  },
  copy: [{
    src: 'src/assets/**/*',
    watch: 'src/assets/**/*',
    dest: path.join('dist', projectRoot)
  }, {
    src: 'assets/**/*',
    watch: 'assets/**/*',
    dest: 'dist'
  }]
};
let isProduction = false;
let isWatchingJS = false;

gulp.task('html', () => {
  const metadata = require('./src/html/metadata.json');
  return gulp.src(paths.html.src)
    .pipe($.data((file) => {
      const pagePath = file.path.slice(
        file.path.indexOf(paths.html.baseDir) + paths.html.baseDir.length,
        - '.jade'.length
      ).replace(/\/index$/, '/');
      return Object.assign({}, metadata, {
        root: projectRoot,
        path: pagePath
      });
    }))
    .pipe($.jade({pretty: true}))
    .pipe(gulp.dest(paths.html.dest))
    .pipe(browserSync.stream());
});

gulp.task('css', () =>
  gulp.src(paths.css.src)
    .pipe($.if(!isProduction, $.sourcemaps.init({loadMaps: true})))
    .pipe($.sass().on('error', $.sass.logError))
    .pipe($.autoprefixer({
      browsers: ['last 1 version', 'Android >= 4.4', 'iOS >= 8', '> 5%'],
      cascade: false
    }))
    .pipe($.if(isProduction, $.cssnano()))
    .pipe($.if(!isProduction, $.sourcemaps.write('.')))
    .pipe(gulp.dest(paths.css.dest))
    .pipe(browserSync.stream({match: '**/*.css'}))
);

gulp.task('js', () => {
  const b = browserify(Object.assign({}, watchify.args, {
    entries: paths.js.src,
    debug: !isProduction
  }))
    .transform('babelify')
    .transform('envify', {
      NODE_ENV: isProduction ? 'production' : 'development'
    });
  const bundle = () => b.bundle()
    .on('error', () => $.util.log('Browserify Error'))
    .pipe(source('bundle.js'))
    .pipe(buffer())
    .pipe($.if(!isProduction, $.sourcemaps.init({loadMaps: true})))
    .pipe($.if(isProduction, $.uglify({
      mangle: true,
      compress: true,
      preserveComments: 'license'
    })))
    .pipe($.if(!isProduction, $.sourcemaps.write('.')))
    .pipe(gulp.dest(paths.js.dest))
    .pipe(browserSync.stream());
  if (isWatchingJS) {
    const w = watchify(b);
    w.on('update', bundle);
    w.on('log', $.util.log);
  }
  return bundle();
});

gulp.task('enable-watch-js', () => isWatchingJS = true);

gulp.task('img', () =>
  gulp.src(paths.img.src)
    .pipe($.if(isProduction, $.imagemin({
      progressive: true,
      interlaced: true
    })))
    .pipe(gulp.dest(paths.img.dest))
    .pipe(browserSync.stream())
);

gulp.task('copy', () =>
  new MergeStream(...paths.copy.map(({src, dest}) =>
    gulp.src(src)
      .pipe(gulp.dest(dest))
  ))
    .pipe(browserSync.stream())
);

gulp.task('serve', () =>
  browserSync.init({
    server: paths.dest,
    ghostMode: false,
    logFileChanges: false,
    open: false,
    reloadDebounce: 300,
    startPath: projectRoot
  })
);

gulp.task('clean', (cb) => rimraf(paths.dest, cb));

gulp.task('build', (cb) =>
  runSequence(
    'clean',
    ['html', 'css', 'js', 'img', 'copy'],
    cb
  )
);

gulp.task('production', (cb) => {
  isProduction = true;
  return runSequence('build', cb);
});

gulp.task('watch', ['enable-watch-js', 'build', 'serve'], () => {
  gulp.watch(paths.html.watch, ['html']);
  gulp.watch(paths.css.watch, ['css']);
  gulp.watch(paths.img.watch, ['img']);
  gulp.watch(paths.copy.map(({watch}) => watch), ['copy']);
});
