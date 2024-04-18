var gulp = require("gulp");
var browserify = require("browserify");
var source = require("vinyl-source-stream");
var paths = {
    pages: ["src/*.html", "src/manifest.json", "src/options.js"],
};
gulp.task("copy-html", function () {
    return gulp.src(paths.pages).pipe(gulp.dest("dist"));
});
gulp.task(
    "default",
    gulp.series(gulp.parallel("copy-html"), function () {
        return browserify({
            basedir: ".",
            debug: true,
            entries: ["src/index.js"],
            cache: {},
            packageCache: {},
        })
            .bundle()
            .pipe(source("bundle.js"))
            .pipe(gulp.dest("dist")); x
    })
);
