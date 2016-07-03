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
const flatten = require('lodash.flatten');
const rimraf = require('rimraf');
const projectRoot = '/project/';
const paths = {
  dest: 'dist',
  html: {
    baseDir: 'src/%type%/html',
    src: [
      'src/%type%/html/**/*.jade',
      '!src/%type%/html/partial/**/*.jade',
      '!src/%type%/html/layout.jade'
    ],
    watch: 'src/%type%/html/**/*.jade',
    dest: path.join('dist', projectRoot, '%type%')
  },
  css: {
    src: [
      'src/%type%/css/**/*.scss',
      '!src/%type%/css/**/_*.scss'
    ],
    watch: 'src/%type%/css/**/*.scss',
    dest: path.join('dist', projectRoot, '%type%/css')
  },
  js: {
    src: 'src/%type%/js/main.js',
    dest: path.join('dist', projectRoot, '%type%/js')
  },
  img: {
    src: 'src/%type%/img/**/*.{gif,jpg,png,svg}',
    watch: 'src/%type%/img/**/*.{gif,jpg,png,svg}',
    dest: path.join('dist', projectRoot, '%type%/img')
  },
  copy: [{
    src: 'src/%type%/assets/**/*',
    watch: 'src/%type%/assets/**/*',
    dest: path.join('dist', projectRoot, '%type%')
  }, {
    src: 'assets/**/*',
    watch: 'assets/**/*',
    dest: 'dist'
  }]
};
const types = {
  pc: {
    src: 'pc',
    dest: '.'
  },
  sp: {
    src: 'sp',
    dest: 'sp'
  }
};
const replacePath = (basePath, dir) => {
  if (Array.isArray(basePath)) {
    const paths = basePath;
    return paths.map((path) => replacePath(path, dir));
  }
  return basePath.replace(/%type%/g, dir);
};
let isProduction = false;
let isWatchingJS = false;

gulp.task('html', () => {
  const metadata = require('./src/metadata.json');
  return new MergeStream(...Object.keys(types).map((key) =>
    gulp.src(replacePath(paths.html.src, types[key].src))
      .pipe($.data((file) => {
        const typeRoot = path.join(projectRoot, types[key].dest) + '/';
        const pagePath = file.path.slice(
          file.path.indexOf(replacePath(paths.html.baseDir, types[key].src)) +
            replacePath(paths.html.baseDir, types[key].src).length,
          - '.jade'.length
        ).replace(/\/index$/, '/');
        return Object.assign({}, metadata, {
          root: projectRoot,
          typeRoot,
          path: pagePath
        });
      }))
      .pipe($.jade({pretty: true}))
      .pipe(gulp.dest(replacePath(paths.html.dest, types[key].dest)))
  ))
    .pipe(browserSync.stream());
});

gulp.task('css', () =>
  new MergeStream(...Object.keys(types).map((key) =>
    gulp.src(replacePath(paths.css.src, types[key].src))
      .pipe($.if(!isProduction, $.sourcemaps.init({loadMaps: true})))
      .pipe($.sass().on('error', $.sass.logError))
      .pipe($.autoprefixer({
        browsers: ['last 1 version', 'Android >= 4.4', 'iOS >= 8', '> 5%'],
        cascade: false
      }))
      .pipe($.if(isProduction, $.cssnano()))
      .pipe($.if(!isProduction, $.sourcemaps.write('.')))
      .pipe(gulp.dest(replacePath(paths.css.dest, types[key].dest)))
  ))
    .pipe(browserSync.stream({match: '**/*.css'}))
);

gulp.task('js', () =>
  new MergeStream(...Object.keys(types).map((key) => {
    const b = browserify(Object.assign({}, watchify.args, {
      entries: replacePath(paths.js.src, types[key].src),
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
      .pipe(gulp.dest(replacePath(paths.js.dest, types[key].dest)))
      .pipe(browserSync.stream());
    if (isWatchingJS) {
      const w = watchify(b);
      w.on('update', bundle);
      w.on('log', $.util.log);
    }
    return bundle();
  }))
)

gulp.task('enable-watch-js', () => isWatchingJS = true);

gulp.task('img', () =>
  new MergeStream(...Object.keys(types).map((key) =>
    gulp.src(replacePath(paths.img.src, types[key].src))
      .pipe($.if(isProduction, $.imagemin({
        progressive: true,
        interlaced: true
      })))
      .pipe(gulp.dest(replacePath(paths.img.dest, types[key].dest)))
  ))
    .pipe(browserSync.stream())
);

gulp.task('copy', () => {
  const streams = paths.copy.map(({src, dest}) => {
    const isTyped = src.indexOf('%type%') > -1;
    if (isTyped) {
      return Object.keys(types).map((key) =>
        gulp.src(replacePath(src, types[key].src))
          .pipe(gulp.dest(replacePath(dest, types[key].dest)))
      );
    }
    return gulp.src(src)
      .pipe(gulp.dest(dest));
  });
  return new MergeStream(...flatten(streams))
    .pipe(browserSync.stream());
});

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
  Object.keys(types).forEach((key) => {
    gulp.watch(replacePath(paths.html.watch, types[key].src), ['html']);
    gulp.watch(replacePath(paths.css.watch, types[key].src), ['css']);
    gulp.watch(replacePath(paths.img.watch, types[key].src), ['img']);
  });
  paths.copy.forEach(({watch, dest}) => {
    const isTyped = watch.indexOf('%type%') > -1;
    if (isTyped) {
      return Object.keys(types).forEach((key) => {
        gulp.watch(replacePath(watch, types[key].src), ['copy']);
      });
    }
    gulp.watch(watch, ['copy']);
  });
});
