"use strict";

module.exports = {
    extends: ["stylelint-config-standard"],
    rules: {
        // Demo styles use BEM names and Tailwind/DaisyUI directives intentionally.
        "selector-class-pattern": null,
        "comment-empty-line-before": null,
        "import-notation": null,
        "at-rule-no-unknown": null,
    },
};
