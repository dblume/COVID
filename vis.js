function
loadData()
{
	var promises = [];
	promises.push(fetchCOVID("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv"));
	promises.push(fetchCOVID("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv"));
// 	promises.push(fetch("https://ghoapi.azureedge.net/api/DIMENSION/COUNTRY/DimensionValues").then((response) => { return response.json(); }));
	promises.push(fetchPopulation("https://latencyzero.github.io/COVID/populations.csv"));
	
	Promise.all(promises).then(
		function()
		{
// 			console.log("Data fetched");
			
			var confirmed = arguments[0][0];
			var deaths = arguments[0][1];
// 			var regions = arguments[0][2]["value"];
			var populations = arguments[0][2];
			
// 			console.log("Confirmed: " + arguments[0][0].length);
// 			console.log("Deaths: " + arguments[0][1].length);
// 			console.log("Recovered: " + arguments[0][2].length);

			processData(confirmed, deaths, populations)
		},
		function (err)
		{
			console.log("Error fetching CSV data: " + err);
		}
	);
}

function
fetchCOVID(inURL)
{
	return d3.csv(inURL,
					function(d)
					{
						//	Convert the count/day columns into an array. This
						//	is very fragile, and depends right now on the
						//	column headers (mm/dd/yy) to be sorted properly….
						//	The Javascript Object does seem to keep the keys
						//	in order, but this could break.
						
						var keys = Object.keys(d)
						keys.splice(0, 4);
						var counts = [];
						keys.forEach(key => { counts.push(parseInt(d[key])); });
						
						var country = d["Country/Region"].trim();
						if (country == "US") country = "United States";		//	Fix up country names
						
						var od = { country: country, counts: counts };
						var state = d["Province/State"].trim();
						if (state)
						{
							od["state"] = state;
							od["full"] = country + " - " + state;
						}
						else
						{
							od["full"] = country
						}
						return od;
					});
}

function
fetchPopulation(inURL)
{
	return d3.csv(inURL,
					function(d)
					{
						var name = d["Country Name"].trim();
						
						//	Find the latest population year…
						
						var pop = 0;
						var year = 0;
						for (var i = 2020; i >= 1960; --i)
						{
							var s = d[i];
							if (s)
							{
								pop = parseInt(s.trim());
								year = i;
								if (pop)
								{
									break;
								}
							}
						}
						var od = { name: name, population: pop, year: year };
						return od;
					});
}

/**
	Post-process the data into structures suitable for our use.
*/

function
processData(inConfirmed, inDeaths, inPopulations)
{
// 	console.log("Confirmed: " + inConfirmed.length);
// 	console.log(inConfirmed[0]);
// 	console.log("Countries: " + inCountries.length);
// 	console.log("Populations: " + inPopulations.length);
	
	//	Build regions list from confirmed cases…
	
	var regions =
		inConfirmed.map(e =>
		{
			var region = { country: e.country, state: e.state, full: e.full }
			return region
		});
	regions.sort((a, b) => { a.full.localeCompare(b.full) });
	
	//	Build maps from region to stats…
	
	var confirmed = new Map();
	inConfirmed.forEach(
		e => {
			confirmed.set(e.full, e.counts);
		});
	
	var deaths = new Map()
	inDeaths.forEach(
		e => {
			deaths.set(e.full, e.counts);
		});
	
	regions.forEach(r =>
		{
			let c = confirmed.get(r.full);
			let d = deaths.get(r.full);
			r.confirmed = c;
			r.deaths = d;
			r.latestConfirmed = Math.max(...c);
			r.latestDeaths = Math.max(...d);
		});
	
	//	Totals for regions with sub regions…
	
	let totalsRegions = {}
	let curTotal = null
	regions.forEach(r =>
	{
		if (r.state)
		{
			curTotal = totalsRegions[r.country]
			if (!curTotal)
			{
				curTotal = JSON.parse(JSON.stringify(r))		//	Deep-copy the region
				curTotal.state = null
				curTotal.full = curTotal.country
				totalsRegions[curTotal.country] = curTotal
			}
			else
			{
				curTotal.confirmed.forEach((s, i) => { curTotal.confirmed[i] += r.confirmed[i] })
				curTotal.deaths.forEach((s, i) => { curTotal.deaths[i] += r.deaths[i] })
				//	If the country matches, then sum the values…
				
				if (r.country == curTotal.country)
				{
				}
				else	//	We’re done with this country, start over
				{
					
					totalsRegions.push(curTotal)
					curTotal = null
				}
			}
		}
	})
	
	//	Get maximums…
	
	let tr = Object.values(totalsRegions)
	tr.forEach(r =>
	{
		r.latestConfirmed = Math.max(...r.confirmed);
		r.latestDeaths = Math.max(...r.deaths);
	})
	
	regions = tr.concat(regions)
	
	//	Group regions…
	
	regions.forEach(r => r.sequence = 999)
	
	//	Sort the regions…
	
	regions.sort((a, b) =>
	{
		if (a.sequence == b.sequence)
		{
			return a.full.localeCompare(b.full)
		}
		else
		{
			return Math.sign(b.sequence - a.sequence)
		}
	});
	regions.forEach((r, idx) => { r["id"] = idx });
	
	gRegions = regions;
	
	//	Update the regions menu…
	
	let regionSel = document.getElementById("regions");
	regions.forEach(
		(r, k) => {
			let opt = document.createElement("option");
			opt.value = r.id;
			opt.textContent = r.full + " (" + r.latestConfirmed + "/" + r.latestDeaths + ")";
			regionSel.appendChild(opt);
		});
	
	//	Populate filters…
	
	let filters = []
	filters.push({
		name: "Top 10 Countries",
		id: 1,
		filter: function(inRegions)
		{
			let results = inRegions.filter(f => !f.state)
			results = results.sort((a, b) => b.latestConfirmed - a.latestConfirmed).slice(0, 10)
			return results
		}
	});
	gFilters = filters
	
	let filtersSel = document.getElementById("filters");
	filters.forEach(
		(f) => {
			let opt = document.createElement("option");
			opt.value = f.id;
			opt.textContent = f.name;
			filtersSel.appendChild(opt);
		});
	
	//	Create the main chart…
	
	createChart()
	addRegionsByFilterID(1)
}

var gChart;

function
getRegionByID(inID)
{
	return gRegions[inID];
}

function
getRegionByName(inName)
{
	return gRegions.find(r => r.full == inName);
}

function
createChart()
{
	let opts = {
		bindto: "#chart1",
		data:
		{
			x: "x",
			columns: [],
			
		},
		axis:
		{
			x:
			{
				label: { text: "Day", position: "outer-middle" },
				type: "timeseries",
				tick: { format: "%b-%d", values: [ new Date(2020, 0, 22), new Date(2020, 1, 1), new Date(2020, 1, 15), new Date(2020, 2, 1), new Date(2020, 2, 15), new Date(2020, 3, 1), new Date(2020, 3, 15), new Date(2020, 4, 1), new Date(2020, 4, 15), new Date(2020, 5, 1), new Date(2020, 5, 15) ] }
			},
			y: { label: { text: "Cases", position: "outer-middle" } },
			y2: { show: false }
		},
		tooltip: { grouped: false }
	}
	gChart = c3.generate(opts);
}

function
addRegionByID(inRegionID)
{
	setTimeout(function()
	{
		let region = getRegionByID(inRegionID)
		addRegion(region)
	}, 10);
}

function
addRegion(inRegion)
{
	if (gSelectedRegions.has(inRegion.id))
	{
// 		console.log("Skipping " + inRegion.country + ", already selected")
		return;
	}
	
// 	console.log(inRegion);
	addRegionTag(inRegion.id, 1);
	
	let confirmed = inRegion.confirmed;
	let deaths = inRegion.deaths;
	
	//	Compute and cache new cases…
	
	var newConfirmed = inRegion["newConfirmed"]
	if (!newConfirmed)
	{
		newConfirmed = confirmed.map((e, idx) =>
			{
				var last = idx == 0 ? 0 : confirmed[idx - 1];
				return e - last;
			});
		inRegion["newConfirmed"] = newConfirmed
	}
	
	//	Get the max value…
	
	let max = Math.max(...confirmed);
// 			gChart
// // 				.yScale(d3.scale.log())
// 				.yDomain([0, chartMax(max)]);
	
	//	Set 
	let regionDates = inRegion.confirmed.map((e, idx) =>
	{
		var d = new Date(2020, 0, 22);
		d.setDate(d.getDate() + idx);
		return d;
	})
	
// 	set Timeout(function()
// 	{
		let dates = ["x"].concat(regionDates);
		gChart.load({
			x: "x",
			columns: [
				dates,
				["c" + inRegion.id].concat(inRegion.confirmed)
			],
			names: { ["c" + inRegion.id] : inRegion.full + "", ["d" + inRegion.id] : inRegion.full + " (deaths)" }
		});
// 	}, 10);

	gSelectedRegions.add(inRegion.id)
}

function
addRegionsByFilterID(inFilterID)
{
	setTimeout(function()
	{
		let filter = gFilters.find(f => f.id == inFilterID)
		let regions = filter.filter(gRegions)
		regions.forEach(r => addRegion(r))
	}, 10);
}

function
addSeriesToChart(inChart)
{
}

function
removeRegion(inRegionID, inChartID)
{
	removeRegionTag(inRegionID, inChartID)
	
	let region = getRegionByID(inRegionID)
	gChart.unload({
		ids: ["c" + region.id, "d" + region.id]
	});
	
	gRegions.delete(inRegionID)
}

/**
	Adds a tag to the specified chart to give the user a way to remove regions.
*/

function
addRegionTag(inRegionID, inChartID)
{
	let region = getRegionByID(inRegionID)
	d3.select("#tags" + inChartID)
		.append("span")
			.attr("class", "region")
			.attr("id", "region" + inRegionID)
			.text(region.full + " (" + region.latestConfirmed + ", " + region.latestDeaths + ")")
			.append("a")
				.attr("class", "remove")
				.attr("onclick", "removeRegion(" + inRegionID + ", " + inChartID + ");")
				.text("×")
}

/**
	Remove the specified region tag from the specified chart.
*/

function
removeRegionTag(inRegionID, inChartID)
{
	d3.select("#tags" + inChartID)
		.select("#region" + inRegionID)
			.remove()
}

var gConfirmed;
var gDeaths;
var gRegions;
var gFilters;
var gSelectedRegions = new Set();


/**
	Returns a maximum value somewhat larger than inMax.
*/

function
chartMax(inMax)
{
	var inc;
	if (inMax < 1000) inc = 100;
	else if (inMax < 10000) inc = 1000;
	else if (inMax < 100000) inc = 10000;
	else if (inMax < 1000000) inc = 100000;
	else inc = 1000000;
	
	return Math.ceil(inMax / inc) * inc;
}

//     var chart;
//     var data;
//     var legendPosition = "top";
// 
//     var randomizeFillOpacity = function() {
//         var rand = Math.random(0,1);
//         for (var i = 0; i < 100; i++) { // modify sine amplitude
//             data[4].values[i].y = Math.sin(i/(5 + rand)) * .4 * rand - .25;
//         }
//         data[4].fillOpacity = rand;
//         chart.update();
//     };
// 
//     var toggleLegend = function() {
//         if (legendPosition == "top") {
//             legendPosition = "bottom";
//         } else {
//             legendPosition = "top";
//         }
//         chart.legendPosition(legendPosition);
//         chart.update();
//     };
// 
//     nv.addGraph(function() {
//         chart = nv.models.lineChart()
//             .options({
//                 duration: 300,
//                 useInteractiveGuideline: true
//             })
//         ;
// 
//         // chart sub-models (ie. xAxis, yAxis, etc) when accessed directly, return themselves, not the parent chart, so need to chain separately
//         chart.xAxis
//             .axisLabel("Time (s)")
//             .tickFormat(d3.format(',.1f'))
//             .staggerLabels(true)
//         ;
// 
//         chart.yAxis
//             .axisLabel('Voltage (v)')
//             .tickFormat(function(d) {
//                 if (d == null) {
//                     return 'N/A';
//                 }
//                 return d3.format(',.2f')(d);
//             })
//         ;
// 
//         data = sinAndCos();
// 
//         d3.select('#chart1').append('svg')
//             .datum(data)
//             .call(chart);
// 
//         nv.utils.windowResize(chart.update);
// 
//         return chart;
//     });

    function sinAndCos() {
        var sin = [],
            sin2 = [],
            cos = [],
            rand = [],
            rand2 = []
            ;

        for (var i = 0; i < 100; i++) {
            sin.push({x: i, y: i % 10 == 5 ? null : Math.sin(i/10) }); //the nulls are to show how defined works
            sin2.push({x: i, y: Math.sin(i/5) * 0.4 - 0.25});
            cos.push({x: i, y: .5 * Math.cos(i/10)});
            rand.push({x:i, y: Math.random() / 10});
            rand2.push({x: i, y: Math.cos(i/10) + Math.random() / 10 })
        }

        return [
            {
                area: true,
                values: sin,
                key: "Sine Wave",
                color: "#ff7f0e",
                strokeWidth: 4,
                classed: 'dashed'
            },
            {
                values: cos,
                key: "Cosine Wave",
                color: "#2ca02c"
            },
            {
                values: rand,
                key: "Random Points",
                color: "#2222ff"
            },
            {
                values: rand2,
                key: "Random Cosine",
                color: "#667711",
                strokeWidth: 3.5
            },
            {
                area: true,
                values: sin2,
                key: "Fill opacity",
                color: "#EF9CFB",
                fillOpacity: .1
            }
        ];
    }
