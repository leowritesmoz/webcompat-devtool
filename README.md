# webcompat-devtool
A devtool extension to help streamline the process of debugging tracker-related webcompat issues. This extension supports the following:
- Viewing all blocked resources
- Select any of the blocked resources to unblock and test if the website is fixed
- An interactive debugger that will narrow down the exact resources that we need to add to the exceptions list


Steps to set up the extension:
1. Clone https://github.com/leowritesmoz/webcompat-devtool
2. In the Firefox repo, check out this patch: https://phabricator.services.mozilla.com/D251771 with moz-phab patch D251771 . Then build with `./mach build`
3. Follow the demo to install the extension. Note: you need to set `xpinstall.signatures.required=false` and `extensions.experiments.enabled=true` inside `about:config`.

Demo: https://drive.google.com/file/d/1-fQreuLGlcEbZiSpwj5XwzT4gzyKJCMW/view?usp=drive_link
