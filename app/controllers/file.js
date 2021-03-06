
module.exports = function(app, model) {

    var mongoose = model.mongoose,
        FileModel = mongoose.model('File'),
        db = model.mongodb,
        GrowingFile = require('growing-mongofile'),
        Step = app.libs.step;

    var actions = {};
    
    var MAX_SIMUL_UP = 1;
    var MAX_UP_MB = 1000;
    
    actions.upload = function(req, res, next) {
        var roomid = req.params.roomid;
        var filesize = req.form.fileInfo.filesize;
        var userip = req.connection.remoteAddress;
        var filename = req.form.fileInfo.filename;
        
        if(!req.session.rooms) {
            next(new Error('user is not connected to any room'));
            return;
        }

        var socketid = req.session.rooms[roomid];

        if(!socketid) {
            next(new Error('client not found in room'));
            return;
        }
        
        Step(
            function loadUser() {
                var nextstep = this;
                app.io.sockets.socket(socketid).get('userinfo', function(err, userinfo) {
                    if(err || !userinfo || !userinfo.username) {
                        next(new Error('user info not found'));
                        return;
                    }
                    
                    nextstep(null, userinfo.username);
                });
            },
            function createFile(err, username) {
                var file = new FileModel({
                    originalname  : filename,
                    uploaderip    : userip,
                    uploadername  : username,
                    size          : filesize
                });
                var nextstep = this;
                file.save(function(err) {
                    nextstep(err, file);
                });
            },
            function createGridStore(err, file) {
                var servername = file.servername;
                var filename = file.originalname;
                var meta = {filesize: filesize, originalname: file.originalname};
                var nextstep = this;
                var gs = new GrowingFile.createGridStore(db, servername, meta, function(err, gs) {
                    if(err || !gs) {
                        next(err);
                        return;
                    }
                    nextstep(null, file);
                });
                
                req.form.speedTarget = 1000;
                
                req.form.onChunk = function(data, callback) {
                    gs.write(data, callback);
                };
                
                req.form.on('close', function() {
                    gs.close(function(err, result) {
                        res.send('ok');
                    });
                });

                req.form.on('error', function(err) {
                    console.log(err);
                });

                req.form.on('aborted', function() {
                    console.log("client has disconnected");
                    gs.unlink(function(err) {
                        next(err);
                    });
                });
            },
            function start(err, file) {
                req.form.read();
                var fileurl = app.url("file.download", {roomid: roomid, fileid: file.servername });
                var fileinfo = {
                    url         : fileurl, 
                    size        : filesize, 
                    name        : file.originalname, 
                    uploadername: file.uploadername
                };
                app.io.of('/file').in(roomid).emit('new file', fileinfo);
            }
        );
        
    };

    actions.download = function(req, res, next) {
        var servername = req.params.fileid;
        /*FileModel.findOne({servername: servername}, function(err, doc) { 
        });*/
        GrowingFile.open(db, servername, null, function(err, gf) {
            if(err || !gf || !gf.originalname) {
                next(err || new Error('File not found'));
                return;
            }
            var filename = gf.originalname;
            var filesize = gf.filesize;
            console.log("downloading "+filename+ " (size : "+filesize+")");
            res.contentType(filename);
            res.attachment(filename);
            res.header('Content-Length', filesize);
            gf.pipe(res);
        });
    };

    actions.socket = function(socket) {
        var hs = socket.handshake;
        
        socket.on('register user', function(roomid, callback) {
            if(typeof callback !== "function") {
                return;
            }
            if(typeof roomid !== "string" || roomid.length > 64) {
                callback('roomid invalid');
                return;
            }
            if(!hs.session) {
                callback('session expired');
                return;
            }
            socket.join(roomid);
            socket.set('roomid', roomid, function() {
                if(!hs.session.rooms) {
                    hs.session.rooms = {};
                }
                hs.session.rooms[roomid] = socket.id;
                hs.session.save(callback);
            });
        });

        socket.on('disconnect', function() {
            if(!hs.session || !hs.session.rooms) {
                return;
            }
            socket.get('roomid', function(err, roomid) {
                if(hs.session.rooms[roomid]) {
                    delete hs.session.rooms[roomid];
                    hs.session.save();
                }
            });
        });
    };

    return actions;
    
}
