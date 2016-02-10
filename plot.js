var gPlots = [];
var gFirefoxId = null;
var gChromeId = null;
var gTitle = null;

function getResultPromise(resultId) {
    return new Promise(function(resolve, reject) {
        d3.csv("http://www.webpagetest.org/result/"+resultId+"/page_data.csv", function(data) {
            resolve(data);
        });
    });
}

function displayDomain(domain) {
    gDomain = domain;
    var oReq = new XMLHttpRequest();
    oReq.addEventListener("load", function() {
        var requests = JSON.parse(this.responseText);
        var promises = [];

        var browsers = document.getElementsByName('browser');
        var connectivity = document.getElementById('connectivity').value;

        var tmp = requests;
        requests = [];
        for (var i in tmp)
            if (tmp[i].connectivity == connectivity)
                for (var j in browsers) {
                    if (browsers[j].checked && (tmp[i].browser_name + " " + tmp[i].browser_version.substring(0,2)).startsWith(browsers[j].value))
                        requests.push(tmp[i]);
                }

        for (var i in requests) {
            promises.push( getResultPromise(requests[i].id) );
        }

        Promise.all(promises).then(function(results) {
            var plots = {};
            for (var i in results) {
                processResult(plots, requests[i].id, results[i], requests[i].browser_name, requests[i].browser_version.substring(0,2), requests[i].connectivity);
            }

            var cached = document.getElementById('cached').checked;
            var stats = document.getElementById("stats");
            stats.textContent = "";

            var plot_values = [];
            for (var i in plots) {
                if (!cached && plots[i].cached)
                    continue;
                console.log(cached+" "+plots[i].cached);
                plot_values.push(plots[i]);
            }
            displayPlot(plot_values, domain);
        });
    });
    oReq.open("GET", "http://webpagetest.meteor.com/api/get/"+encodeURIComponent(domain));
    oReq.send();
}

function displayStatLine(content) {
    var stats = document.getElementById("stats");
    stats.appendChild(document.createTextNode(content));
    stats.appendChild(document.createElement("br"));
}

function displayPlot(plots, title) {
    var sorted = document.getElementById('sorted').checked;
    var unsorted = JSON.parse(JSON.stringify(plots));

    for (var plotIndex in plots) {
      var plot = plots[plotIndex];
      for (var i = 0; i < plot.y.length; i++)
        for (var j = i; j< plot.y.length; j++)
          if (parseInt(plot.y[i]) > parseInt(plot.y[j])) {
            var temp = plot.y[i];
            plot.y[i] = plot.y[j];
            plot.y[j] = temp;

            temp = plot.info[i];
            plot.info[i] = plot.info[j];
            plot.info[j] = temp;
          }
      plot.x = [];
      for (var i = 0; i < plot.y.length; i++) {
        plot.x.push(i);
      }
    }

    // Compute stats

    var avgFirstDiff = 0;
    var avgRepeatDiff = 0;

    var firstViewPlots = [];
    var repeatViewPlots = [];

    var countFirstBetter = 0;
    var countRepeatBetter = 0;

    for (var plotIndex in plots) {
        if (plots[plotIndex].cached)
            repeatViewPlots.push(plots[plotIndex]);
        else
            firstViewPlots.push(plots[plotIndex]);
    }

    var count = 0;
    for (var i=0;i<firstViewPlots[0].y.length;i++)
        if (parseInt(firstViewPlots[0].y[i]) && parseInt(firstViewPlots[1].y[i]))
    {
        count++;
        avgFirstDiff += firstViewPlots[0].y[i] - firstViewPlots[1].y[i];
        if (parseInt(firstViewPlots[0].y[i]) < parseInt(firstViewPlots[1].y[i]))
            countFirstBetter++;
    }

    avgFirstDiff = avgFirstDiff/count;

    displayStatLine("Average first diff: " + avgFirstDiff.toFixed(2));
    displayStatLine("Count first better: "+countFirstBetter+" / "+count);

    count = 0;
    for (var i=0;i<repeatViewPlots[0].y.length;i++)
        if (parseInt(repeatViewPlots[0].y[i]) && parseInt(repeatViewPlots[1].y[i]))
    {
        count++;
        avgRepeatDiff += repeatViewPlots[0].y[i] - repeatViewPlots[1].y[i];
        if (parseInt(repeatViewPlots[0].y[i]) < parseInt(repeatViewPlots[1].y[i]))
            countRepeatBetter++;
    }

    avgRepeatDiff = avgRepeatDiff/count;

    displayStatLine("Average repeat diff: " + avgRepeatDiff.toFixed(2));
    displayStatLine("Count repeat better: "+countRepeatBetter+" / "+count);

    //

    if (!sorted) {
        plots = unsorted;
    }

    var tableColumn = document.getElementById('column').value;
    var layout = {
      hovermode:'closest',
      title: title,
      xaxis: {
        title: 'run index',
        titlefont: {
          size: 18,
        }
      },
      yaxis: {
        title: tableColumn,
        titlefont: {
          size: 18,
        }
      }
    };

    Plotly.newPlot('myDiv', plots, layout);
    var myPlot = document.getElementById('myDiv');
    myPlot.on('plotly_click', function(data){
        var index = data.points[0].x;
        window.open("http://www.webpagetest.org/result/" + data.points[0].data.info[index]);
    });
}

function lazyGetPlot(plotTable, browser_name, browser_version, cached, connectivity) {
  var colors = { 'Firefox': 'red', 'Google Chrome': 'gray', 'Nightly': 'blue'};
  var color = (cached ? 'light' : '') + colors[browser_name];

  var id = browser_name + " " + browser_version + " " + (cached ? "repeatView" : "firstView") + " " + connectivity;
  if (plotTable[id]) {
    return plotTable[id];
  }

  var sorted = document.getElementById('sorted').checked;
  var mode = (sorted ? "lines+" : "") + "markers";
  plotTable[id] = { name: id, x: [], y: [], info: [], mode: mode, type: 'scatter',  marker: { color: color }, cached: cached };
  return plotTable[id];
}

function processResult(plots, testid, allRows, browser_name, browser_version, connectivity) {
    var net = lazyGetPlot(plots, browser_name, browser_version, 0, connectivity);
    var cache = lazyGetPlot(plots, browser_name, browser_version, 1, connectivity);

    var tableColumn = document.getElementById('column').value;

    var net_len = net.x.length - 1;
    var cache_len = cache.x.length - 1;

    for (var i = 0; i < allRows.length; i++) {
        var row = allRows[i];

        var y = row[tableColumn];
        var x = parseInt(row['Run']);
        var cached = parseInt(row['Cached']);
        var text = testid+"/"+x+"/details" + (cached ? "/cached" : "");
        
        if (!cached) {
            net.x.push(x+net_len);
            net.y.push(y);
            net.info.push(text);
        } else {
            cache.x.push(x+cache_len);
            cache.y.push(y);
            cache.info.push(text);
        }
    }
}

window.addEventListener("load", function() {
    var oReq = new XMLHttpRequest();
    oReq.addEventListener("load", function() {
        var table = document.getElementById("domains");
        var domains = JSON.parse(this.responseText);
        for (var i in domains) {
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            var domain = domains[i];
            td.onclick = function() {
                displayDomain(this.textContent);
                return false;
            }
            var a = document.createElement('a');
            a.href = "#";
            a.textContent = domains[i];
            td.appendChild(a);
            tr.appendChild(td);
            table.appendChild(tr);
        }
    });
    //oReq.open("GET", "http://webpagetest.meteor.com/api/domains");
    oReq.open("GET", "top100.json");
    oReq.send();
});

function displayTable(testData) {
    var div = computeTable(testData);
    document.body.appendChild(div);
}
