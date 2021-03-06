
function runChatClient(app) {
    
    var client = io.connect('/chat');//app.client;
    
    client.on('new message',  addMessage);
    client.on('new messages', addMessages);
    
    client.on('ready',        app.showWelcomeMessage);
    client.on('users',        app.setUsers);
    client.on('user joined',  app.userJoined);
    client.on('user left',    app.userLeft);
    client.on('user renamed', app.userRenamed);

    client.on('connect', function () {
        client.emit('join room', app.ROOMID, function(err, name) {
            if(err) console.log(err);
            else app.setUsername(name);
        });
    });
    

    function addMessage(msg) {
        app.showMessage(msg.username, msg.body);
    }
    
    function addMessages(messages) {
        if(messages && messages.constructor === Array) {
            messages.forEach(addMessage);
        }
    }



    /* ---- bind ui events ---- */
    
    function bindEnter(component, callback) {
        component.keyup(function(e) {
            var code = (e.keyCode ? e.keyCode : e.which);
            if(code == 13) { // ENTER
                e.preventDefault();
                callback();
            }
        });
    }
    
    app.submitMessageButton.click(sendMessageHandler);
    app.renameButton.click(renameHandler);
    bindEnter(app.messageBox, sendMessageHandler);
    bindEnter(app.nameBox, renameHandler);
    
    function sendMessageHandler() {
        var msg = app.messageBox.val();
        if(msg != '\n') {
            sendMessage(msg);
            addMessage({username: app.username, body: msg});
        }
        app.messageBox.val('');
    }
    
    function renameHandler() {
        var name = app.nameBox.val();
        if(name && name != app.username) {
            changeUsername(name);
        }
        app.messageBox.val('');
    }

    function sendMessage(message) {
        if(message) {
            if(message > app.MAX_MSG_LEN) message = message.substr(0, app.MAX_MSG_LEN);
		    client.emit("message", message);
        }
    }

    function changeUsername(newname) {
        if(newname) {
            if(newname > app.MAX_USR_LEN) newname = newname.substr(0, app.MAX_USR_LEN);
		        client.emit("username change", newname, function(err, name) {
                if(err) {
                    alert(err);
                } else {
                    app.setUsername(newname);
                }
            });
        }
    }

}

