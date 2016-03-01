(function(window, d3, _) { "use strict";

function animate(chunk) {
	var isRunning = true;
	var requestId = null;
	var quanta = 0;
	var last = 0;

	var TICK_RATE = 1/3;

	var wrapper = function(now) {
		var dt = (now - last) * 0.001;
		last = now;
		quanta += Math.min(dt, TICK_RATE);
		while (quanta >= TICK_RATE) {
			chunk(TICK_RATE);
			quanta -= TICK_RATE;
		}
		if (isRunning) requestId = requestAnimationFrame(wrapper);
	}
	requestId = requestAnimationFrame(wrapper);
	return function() {
		isRunning = false;
		cancelAnimationFrame(requestId);
	};
}

function Node(opts) {
	if (!(this instanceof Node)) return new Node(opts);
	this.dummy = !!opts.dummy;
	if (!this.dummy) {
		this.name  = opts.name;
		this.value = opts.value;
		this.links = [];	
	}
	else {
		this.parent = opts.parent;
	}
}
Node.prototype.oneStepTo = function(otherNode) {
	return this.links.some(function(l) {
		return l.target === otherNode;
	});
};
function Link(opts) {
	if (!(this instanceof Link)) return new Link(opts);
	this.dummy  = !!opts.dummy;
	this.source = opts.source;
	this.target = opts.target;
	if (!this.dummy) {
		this.probability = opts.p;
	}
}

function Graph(opts) {
	if (!(this instanceof Graph)) return new Graph(opts);

	var svg = this.svg = opts.svg.append("g");

	var force = this.force = d3.layout.force()
		.gravity(0.05)
		.charge(-1000)
		.linkStrength(1)
		.linkDistance(100)
		.size([opts.width, opts.height])

	this.E = {};
	this.setData(opts);

	force.on("tick", Graph.prototype.redrawLinks.bind(this));
}
Graph.prototype.setData = function(data) {
	var nodes = this.nodes = data.nodes.map(Node);
	var links = this.links = data.links.map(Link);

	this.force.stop();
	this.force.nodes(nodes).links(links);
	this.origValues = nodes.map(function(d) { return d.value; });

	this.links.forEach(function(link) {
		if (link.source === link.target) {
			var dummyNode = new Node({
				dummy: true,
				parent: nodes[link.source]
			});
			nodes.push(dummyNode);
			links.push(new Link({
				dummy: true,
				source: dummyNode,
				target: dummyNode.parent,
			}));
			link.dummyNode = dummyNode;
		}
		var src = nodes[link.source];
		src.links = src.links || [];
		src.links.push(link);
	});

	var svg = this.svg;
	var E = this.E;

	E.link = svg.selectAll(".link")
			.data(links.filter(function(d) { return !d.dummy; }));
	E.link.exit().remove();
	E.link.enter()
		.append("path")
			.attr("class", "link")
			.style("stroke-width", function(d) { return 3; });


	E.node = svg.selectAll(".node")
		.data(nodes.filter(function(d) { return !d.dummy; }));
	E.node.exit().remove();
	E.node.enter()
		.append("g")
			.attr("class", "node")
			.call(this.force.drag);
	
	// Node circles
	E.circles = E.node.selectAll("circle")
		.data(function(d) { return [d]; });
	E.circles.exit().remove();
	E.circles.enter()
		.append("circle")
			.attr("r", 30)
			.style("fill", function(d) { return d3.hsl(207, d.value, 0.49); });


	// Node labels
	E.node.selectAll("text.label")
		.data(function(d) { return [d]; })
		.enter()
		.append("text")
			.attr("class", "label")
			.attr("dy", -5)
			.text(function(d) { return d.name; });

	// Node percent value
	var percentFormat = this.percentFormat = d3.format("3.1%")
	E.percent = E.node.selectAll("text.percent")
		.data(function(d) { return [d]; });
	E.percent.exit().remove();
	E.percent.enter()
		.append("text")
			.attr("class", "percent")
			.attr("dy", 17)
			.text(function(d) { return percentFormat(d.value); });

	for (var i=0; i < 200; i++) this.force.tick();
	this.force.start();
	
	this.redrawNodes();
};
Graph.LOOP_TEMPLATE = _.template("M ${sx},${sy} A ${rx},${ry} ${x_axis_rotation},${large_arc_flag},${sweep_flag} ${tx},${ty}");
Graph.LINK_TEMPLATE = _.template("M ${sx},${sy} L ${tx},${ty}");
Graph.LOOP_COS = Math.cos(Math.PI/7);
Graph.LOOP_SIN = Math.sin(Math.PI/7);
Graph.LINK_COS = Math.cos(Math.PI/20);
Graph.LINK_SIN = Math.sin(Math.PI/20);
Graph.prototype.redrawLinks = function() {
	var E = this.E;
	E.link.attr("d", function(link) {

		if (link.source === link.target) {
			var dummyNode = link.dummyNode;
			var dx = dummyNode.x - link.source.x;
			var dy = dummyNode.y - link.source.y;
			var dd = Math.sqrt(dx*dx + dy*dy)
			var cos = dx / dd;
			var sin = dy / dd;

			if (dd === 0) return "";

			return Graph.LOOP_TEMPLATE({
				sx: link.source.x + 36*(Graph.LOOP_COS*cos - Graph.LOOP_SIN*sin),
				sy: link.source.y + 36*(Graph.LOOP_COS*sin + Graph.LOOP_SIN*cos),
				rx: 20,
				ry: 20,
				x_axis_rotation: 0,
				large_arc_flag: 1,
				sweep_flag: 0,
				tx: link.source.x + 36*(Graph.LOOP_COS*cos + Graph.LOOP_SIN*sin),
				ty: link.source.y + 36*(Graph.LOOP_COS*sin - Graph.LOOP_SIN*cos),
			});
		}

		var dx  = link.target.x - link.source.x;
		var dy  = link.target.y - link.source.y;
		var dd  = Math.sqrt(dx*dx + dy*dy);
		var cos = dx / dd;
		var sin = dy / dd;

		if (dd === 0) return "";

		return Graph.LINK_TEMPLATE({
			sx: link.source.x + 36*(Graph.LINK_COS*cos - Graph.LINK_SIN*sin),
			sy: link.source.y + 36*(Graph.LINK_COS*sin + Graph.LINK_SIN*cos),
			tx: link.target.x - 36*(Graph.LINK_COS*cos + Graph.LINK_SIN*sin),
			ty: link.target.y - 36*(Graph.LINK_COS*sin - Graph.LINK_SIN*cos),
		});
	});

	E.node.attr("transform", function(d) {
		return "translate(" + d.x + "," + d.y + ")";
	});
};
Graph.prototype.redrawNodes = function(transitionDuration) {
	var percentFormat = this.percentFormat;

	if (!transitionDuration) {
		this.E.circles.style("fill", function(d) { return d3.hsl(207, d.value, 0.49); });
		this.E.percent.text(function(d) { return percentFormat(d.value); });
	}
	else {
		this.E.circles.transition()
			.duration(transitionDuration)
			.style("fill", function(d) { return d3.hsl(207, d.value, 0.49); });
		this.E.percent.transition()
			.duration(transitionDuration)
			.tween("text", function(d) {
				var interpolator = d3.interpolateNumber(d.oldValue, +d.value);
				return function(t) {
					this.textContent = percentFormat(interpolator(t));
				};
			});
	}

};
Graph.prototype.reset = function() {
	var origValues = this.origValues;
	this.nodes.forEach(function(node, i) {
		if (node.dummy) return;
		//node.x = node.px = 0;
		//node.y = node.py = 0;

		node.value = origValues[i];
	});
	this.redrawNodes();
	//this.force.start();
};
Graph.prototype.step = function(dt, duration) {
	if (dt < 0 || dt > 1) throw "Invalid step size: " + dt;

	var newValues = this.nodes.map(function(d) { return d.value; });
	// Compute new values
	this.links.forEach(function(link) {
		if (link.dummy) return;
		newValues[link.source.index] -= link.probability * link.source.value * dt;
		newValues[link.target.index] += link.probability * link.source.value * dt;

	});
	// Update all AFTER computing
	this.nodes.forEach(function(node) {
		if (node.dummy) return;
		node.oldValue = node.value;
		node.value = newValues[node.index];
	});

	this.redrawNodes(duration);
};


d3.json("markov.json", function(error, data) {
	if (error) throw error;

	var width = 960;
	var height = 500;

	// Preparacion del grafico
	var svg = d3.select("svg")
		.attr("width",  width)
		.attr("height", height)

	svg
		.append("defs")
		.append("marker")
			.attr("id", "arrow")
			.attr("viewBox", "0 -5 10 5")
			.attr("refX", 3)
			.attr("refY", 0)
			.attr("markerUnits", "strokeWidth")
			.attr("markerWidth",  10)
			.attr("markerHeight", 10)
			.attr("orient", "auto")
		.append("path")
			.attr("class", "marker")
			.attr("d", "M 0,-2 L 5,0 L 0,2");


	var g = new Graph({
		nodes: data.nodes,
		links: data.links,
		svg: svg,
		width: width,
		height: height,
	});

	var running = false;
	var stopAnimation = _.noop;

	d3.select("#play").on("click", function() {
		running = !running;
		if (running) {
			stopAnimation = animate(Graph.prototype.step.bind(g));
		} 
		else {
			stopAnimation();
		}
		d3.select(this).select("span").attr("class", running ? "fa fa-pause" : "fa fa-play");
		d3.selectAll("#step, #reset").property("disabled", running);
	});
	d3.select("#step").on("click", function() {
		stopAnimation();
		g.step(1, 1000);
	});
	d3.select("#reset").on("click", function() {
		stopAnimation();
		g.reset();
		var data = JSON.parse(d3.select("#graphJSON").property("value"));
		console.log(data)
		g.setData(data);
	});
});


CodeMirror.fromTextArea(document.getElementById("graphJSON"), {
	mode: "application/json",
	theme: "monokai",
	lineNumbers: true,
	dragDrop: false, // WTF?
});


// http://stackoverflow.com/a/6637396/3080396
$(document).delegate("textarea", "keydown", function(e) {
	var keyCode = e.keyCode || e.which;

	if (keyCode == 9) {
		e.preventDefault();
		var start = $(this).get(0).selectionStart;
		var end = $(this).get(0).selectionEnd;

		// set textarea value to: text before caret + tab + text after caret
		$(this).val($(this).val().substring(0, start)
		            + "\t"
		            + $(this).val().substring(end));

		// put caret at right position again
		$(this).get(0).selectionStart =
		$(this).get(0).selectionEnd = start + 1;
	}
});


})(window, d3, _);