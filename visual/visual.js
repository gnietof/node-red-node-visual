module.exports = function(RED) {

	var http = require('http');
	var https = require('https');
	
	var cfEnv = require("cfenv");
	var util = require("util");

	var watson = require('watson-developer-cloud');
	var temp = require('temp');
	temp.track();
	
	var fs = require('fs');
	var fileType = require('file-type');
	var request = require('request');

	var appEnv	= cfEnv.getAppEnv();
		
		// GNF: Read credentials information from the VCAP environment variable

		var visual = [];
		for (var i in appEnv.services) {
				// filter the services to include only the Visual Recognition ones
				if (i.match(/^(visual_recognition)/i)) {
						visual = visual.concat(appEnv.services[i].map(function(v) {
								return {
									name: v.name, 
									label: v.label, 
									username: v.credentials.username,
									password: v.credentials.password,
									};
						}));
				}
		}

	util.log("*** VISUAL: "+JSON.stringify(visual));

	// GNF: This method provides service credentials when prompted from the node editor
	RED.httpAdmin.get('/watson-visual-recognition/vcap', function(req,res) {
		res.send(JSON.stringify(visual));
	});
	
	RED.httpAdmin.get('/watson-visual-recognition/list/:service', function(req,res) {

		var username,password;
		var service = req.params.service;
		
        for (var i2=0; i2 < visual.length; i2++) {
        	if (visual[i2].name===service) {
        		username = visual[i2].username;
        		password = visual[i2].password;
        	}
    	}
		
		var visual_recognition = watson.visual_recognition({
			username: username,
			password: password,
			version: 'v2-beta',
			version_date: '2015-12-02'
		});
			
		visual_recognition.listClassifiers({},
			function(err, response) {
				if (err) 
					throw(err);
			 	else
					res.send(JSON.stringify(response));
			}
		);
	});

	function VisualUtilNode(config) {
		
		RED.nodes.createNode(this,config);

		this.name = config.name;
		this.classifier = config.classifier;
		this.command = config.command;
		this.username = config.username;
		this.password = config.password;
		this.service = config.service;		

		var node = this;

		this.doDelete = function(msg) {
			var visual_recognition = watson.visual_recognition({
			  username: node.username,
			  password: node.password,
			  version: 'v2-beta',
			  version_date: '2015-12-02'
			});
			
			visual_recognition.deleteClassifier({
				classifier_id: node.classifier },
				function(err, response) {
					if (err) 
						node.error(err);
				 	else
						node.send({"payload": response});
				}
			);
		};

		this.doList = function(msg) {

			var visual_recognition = watson.visual_recognition({
 
				username: node.username,
				password: node.password,
				version: 'v2-beta',
				version_date: '2015-12-02'
			});
			
			visual_recognition.listClassifiers({},
				function(err, response) {
					if (err) 
						node.error(err);
				 	else
						node.send({"payload": response});
				}
			);

		};

		this.doDetails = function(msg) {
			var visual_recognition = watson.visual_recognition({
			  username: node.username,
			  password: node.password,
			  version: 'v2-beta',
			  version_date: '2015-12-02'
			});

			visual_recognition.getClassifier({
				classifier_id: node.classifier },
				function(err, response) {
					if (err) 
						node.error(err);
				 	else
						node.send({"payload": response});
				}
			);
		};

		this.on('input', function (msg) {
			switch(this.command) {
				case "list":
					this.doList(msg);
					break;
				case "details":
					this.doDetails(msg);
					break;
				case "delete":
					this.doDelete(msg);
					break;
			}
		});
		
	}

	RED.nodes.registerType("watson-visual-util",VisualUtilNode);

	function VisualTrainingNode(config) {

		RED.nodes.createNode(this,config);

		this.name = config.name;
		this.classifier = config.classifier;
		this.username = config.username;
		this.password = config.password;
		this.service = config.service;		

		var node = this;

		this.doCall = function(msg) {

/*
 		var file_extension = function (file) {
 
			var ext = '.jpeg';

			// For URLs, look for file extension in the path, default to JPEG.
			if (typeof file === 'string') {
				var match = file.match(/\.[\w]{3,4}$/i)
				ext = match && match[0]
			// ...for Buffers, we can look at the file header.
			} else if (file instanceof Buffer) {
				ext = '.' + fileType(file).ext;
			}

			return ext;
		}
*/			
			var visual_recognition = watson.visual_recognition({
				username: node.username,
				password: node.password,
				version: 'v2-beta',
				version_date: '2015-12-02'
			});
	
			var stream_buffer = function (file, contents, cb) {
				fs.writeFile(file, contents, function (err) {
					if (err) throw err;
					cb(fileType(contents).ext);
				});
			};
	
			var stream_url = function (file, location, cb) {
				var wstream = fs.createWriteStream(file);
				wstream.on('finish', function () {
					fs.readFile(file, function (err, buf) {
						if (err) throw(err);
						cb(fileType(buf).ext);
					});
				});
				request(location).pipe(wstream);
			};
			
			var stream_positive = (typeof msg.positive === 'string') ? stream_url : stream_buffer;
			var stream_negative = (typeof msg.negative === 'string') ? stream_url : stream_buffer;
	
			temp.open({suffix: '.zip'}, function (err, info) {
				if (err) throw err;
				
				stream_positive(info.path, msg.positive, function (format) {
	
					temp.open({suffix: '.zip'}, function (err2, info2) {
						if (err2) throw err2;
	
						stream_negative(info2.path, msg.negative, function (format) {
								
							var params = {
								name: node.classifier,
								positive_examples: fs.createReadStream(info.path),
								negative_examples: fs.createReadStream(info2.path)
							};
								
							visual_recognition.createClassifier(params, 
								function(err, response) {
									if (err) {
										node.error(err);
									} else {
										node.send({"payload" : response});
									}
									temp.cleanup();
								}
							);											
						});
					});
				});
			});
		};

		this.on('input', function (msg) {
			this.doCall(msg);
		});
				
	}

	RED.nodes.registerType("watson-visual-training",VisualTrainingNode);
	
// START COPY
// This is a copy of the original code for the Recognition node to solve a bug

//	var username,password; 
	
//	var service = cfEnv.getAppEnv().getServiceCreds(/visual_recognition/i);

/*
  	if (service) {
    	username = service.username;
    	password = service.password;
  	}
*/  
	function VisualRecognitionNode(config) {

		RED.nodes.createNode(this,config);
			
		var node = this;

		this.on('input', function(msg) {
			if (!msg.payload) {
				var message = 'Missing property: msg.payload';
				node.error(message, msg);
				return;
			}

			if (!msg.payload instanceof Buffer || !typeof msg.payload === 'string') {
				var message = 'Invalid property: msg.payload, must be a URL or a Buffer.';
				node.error(message, msg);
				return;
			}

			var visual_recognition = watson.visual_recognition({
				username: node.username,
				password: node.password,
				version: 'v2-beta',
			  	version_date: '2015-12-02'
			});

			var file_extension = function (file) {
				var ext = '.jpeg';

				// For URLs, look for file extension in the path, default to JPEG.
				if (typeof file === 'string') {
				var match = file.match(/\.[\w]{3,4}$/i)
				ext = match && match[0]
				// ...for Buffers, we can look at the file header.
				} else if (file instanceof Buffer) {
				ext = '.' + fileType(file).ext;
				}

				return ext;
			}

			var stream_buffer = function (file, contents, cb) {
			fs.writeFile(file, contents, function (err) {
					if (err) throw err;
					cb();
				});
			};

			var stream_url = function (file, location, cb) { 
				var wstream = fs.createWriteStream(file)
				wstream.on('finish', cb);

				request(location)
				.pipe(wstream);
			};

			var stream_payload = (typeof msg.payload === 'string') ? stream_url : stream_buffer;
//			var stream_classifiers = (typeof msg.classifiers === 'string') ? stream_url : stream_buffer;

			temp.open({suffix: file_extension(msg.payload)}, function (err, info) {
				if (err) throw err;

				stream_payload(info.path, msg.payload, function () {
					node.status({fill:"blue", shape:"dot", text:"requesting"});
					var params = {
						images_file: fs.createReadStream(info.path),
						classifier_ids: JSON.stringify(msg.classifiers) //fs.readFileSync('./classifierlist.json')
					};
				
					visual_recognition.classify(params, 
						function(err2, response) {
							node.status({});
						   	if (err2)
					    		node.error(err2);
					    	else
						   		node.send({"payload": response});
						}
					);

				});
			});
		});
	}
	
	RED.nodes.registerType("watson-visual-recognition2",VisualRecognitionNode, {
		credentials: {
			username: {type:"text"},
			password: {type:"password"}
			}
	});
}

// END OF THE COPY