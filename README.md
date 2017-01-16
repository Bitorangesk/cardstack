Work in progress
================

Building native nodegit dep on osx
--------------------------------

You need the latest Xcode *and* you need to manually tell it to get the latest CLI tools via

    sudo xcode-select --install
    
Merely upgrading Xcode will still leave you broken and frustrated.

I cloned and built nodegit in its own repo, and then used `yarn link`. This seems to function as insurance against `yarn` deciding to rebuild it from scratch (which takes a long time).

Notes on vagrant & debugging
-----

I created a vagrant config that runs everything under Linux. This is nice to containing the dependencies like elasticsearch.

A downside of the Vagrant virtual machine is that it's not obvious how to debug using VSCode (which is the best node debugger by far, at the present).

To debug, add `--debug=0.0.0.0:5858` to a node command within the VM, and use the "Attach to Process" launch target in vscode. There is a `debug-test` script in package.json that does this for the test suite.

`--debug-brk` doesn't seem to work due to V8 Proxy bugs, so you may need to manually insert `debugger` statements to get the program to wait for you. 




