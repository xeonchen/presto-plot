 'use strict';

(function() {

    let gDomain = null;
    let gDomainData = null;
    let gBrowsers = null;
    let gLabel = null;

    const WPT_SERVER = 'http://moz.xeon.tw';
    const PRESTO_SERVER = 'http://moz.xeon.tw:3000';

    function makeXHRRequest(url) {
        return new Promise(function(resolve, reject) {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', url);

            xhr.onload = function() {
                if (this.status >= 200 && this.status < 300) {
                    resolve(this.responseText);
                } else {
                    reject({ status: this.status, statusText: xhr.statusText });
                }
            };

            xhr.onerror = function() {
                reject({ status: this.status, statusText: xhr.statusText });
            };

            xhr.send();
        });
    }

    function getResultPromise(resultId) {
        return new Promise(function(resolve, reject) {
            let url = WPT_SERVER + '/result/' + resultId + '/page_data.csv';
            d3.csv(url, function(data) {
                resolve(data);
            });
        });
    }

    function updateDomain(domain) {
        console.log('domain: ' + domain + ', gDomain: ' + gDomain);
        // if (domain == gDomain) {
        //     return new Promise(function(resolve, reject) {
        //         resolve(gDomainData);
        //     });
        // }

        let url = PRESTO_SERVER + '/api/get/' + encodeURIComponent(domain);
        if (gLabel) {
            url += '?label=' + gLabel;
        }

        console.log('url: ' + url);
        return makeXHRRequest(url).then(responseText => {
            gDomain = domain;
            gDomainData = JSON.parse(responseText);
            console.log('gDomainData: ' + gDomainData);
            return gDomainData;
        });
    }

    function displayDomain(domain) {
        updateDomain(domain).then(response => {
            let browsers = gBrowsers;

            console.log('response: ' + response);
            let filtered = response.filter(e => {
                if (!browsers) return true;
                for (let b of browsers) {
                    if ((e.browser_name + ' ' + e.browser_version).startsWith(b)) {
                        return true;
                    }
                }
                return false;
            });

            let promises = filtered.map(obj => { return getResultPromise(obj.id); });

            Promise.all(promises).then(function(results) {
                let plots = {};
                console.log('results: ' + results);
                for (let i in results) {
                    if (filtered[i].browser_name && filtered[i].browser_version) {
                        processResult(plots, filtered[i].id, results[i], filtered[i].browser_name, filtered[i].browser_version.substring(0,2));
                    }
                }

                let cached = $("#cached").is(':checked');

                $('#average').empty();
                $('#details').empty();

                let plot_values = [];
                for (let i in plots) {
                    if (!cached && plots[i].cached)
                        continue;
                    plot_values.push(plots[i]);
                }
                displayPlot(plot_values, domain);
            });
        });
    }

    function displayStatLine(content) {
    }

    function addRow(table) {
        let tr = document.createElement('tr');

        for (let i = 1; i < arguments.length; i++) {
            let td = document.createElement('td');
            td.textContent = arguments[i];
            tr.appendChild(td);
        }

        table.appendChild(tr);
        return table;
    }

    function addAverageRow(browser, value) {
        let average = document.getElementById('average');
        return addRow(average, browser, value);
    }

    function addDetailRow(browser, key, value) {
        let details = document.getElementById('details');
        return addRow(details, browser, key, value);
    }

    function displayPlot(plots, title) {
        console.log('displayPlot');
        let sorted = $("#sorted").is(':checked');
        let unsorted = JSON.parse(JSON.stringify(plots));

        for (let plotIndex in plots) {
          let plot = plots[plotIndex];
          for (let i = 0; i < plot.y.length; i++)
            for (let j = i; j< plot.y.length; j++)
              if (parseInt(plot.y[i]) > parseInt(plot.y[j])) {
                let temp = plot.y[i];
                plot.y[i] = plot.y[j];
                plot.y[j] = temp;

                temp = plot.info[i];
                plot.info[i] = plot.info[j];
                plot.info[j] = temp;
              }
          plot.x = [];
          for (let i = 0; i < plot.y.length; i++) {
            plot.x.push(i);
          }
        }

        // Compute stats

        let averages = [];

        let avgFirstDiff = 0;
        let avgRepeatDiff = 0;

        let firstViewPlots = [];
        let repeatViewPlots = [];

        let countFirstBetter = 0;
        let countRepeatBetter = 0;

        console.log('plots: ' + plots);
        for (let plotIndex in plots) {
            console.log('plotIndex: ' + plotIndex);
            if (plots[plotIndex].cached) {
                repeatViewPlots.push(plots[plotIndex]);
                repeatViewPlots.push(plots[plotIndex]);
            } else {
                firstViewPlots.push(plots[plotIndex]);
                firstViewPlots.push(plots[plotIndex]);
            }

            let avg = 0;
            for (let i = 0; i < plots[plotIndex].y.length; i++) {
                avg += plots[plotIndex].y[i]/plots[plotIndex].y.length;
                addDetailRow(plots[plotIndex].name, i + 1, plots[plotIndex].y[i]);
            }
            addAverageRow(plots[plotIndex].name, avg.toFixed(2));
        }

        if (firstViewPlots.length == 0) {
            // Clear the graph.
            console.log('firstViewPlots is empty');
            Plotly.newPlot('result_plot', [], {});
            return;
        }

        let count = 0;
        for (let i=0;i<firstViewPlots[0].y.length;i++)
            if (parseInt(firstViewPlots[0].y[i]) && parseInt(firstViewPlots[1].y[i]))
        {
            count++;
            avgFirstDiff += firstViewPlots[0].y[i] - firstViewPlots[1].y[i];
            if (parseInt(firstViewPlots[0].y[i]) < parseInt(firstViewPlots[1].y[i]))
                countFirstBetter++;
        }

        displayStatLine(firstViewPlots[0].name+' '+firstViewPlots[0].version +' vs. '+firstViewPlots[1].name+' '+firstViewPlots[1].version);

        avgFirstDiff = avgFirstDiff/count;

        displayStatLine('Average first diff: ' + avgFirstDiff.toFixed(2));
        displayStatLine('Count first better: '+countFirstBetter+' / '+count);

        let cached = document.getElementById('cached').checked;
        if (cached) {

            count = 0;
            for (let i=0;i<repeatViewPlots[0].y.length;i++)
                if (parseInt(repeatViewPlots[0].y[i]) && parseInt(repeatViewPlots[1].y[i]))
            {
                count++;
                avgRepeatDiff += repeatViewPlots[0].y[i] - repeatViewPlots[1].y[i];
                if (parseInt(repeatViewPlots[0].y[i]) < parseInt(repeatViewPlots[1].y[i]))
                    countRepeatBetter++;
            }

            avgRepeatDiff = avgRepeatDiff/count;

            displayStatLine('Average repeat diff: ' + avgRepeatDiff.toFixed(2));
            displayStatLine('Count repeat better: '+countRepeatBetter+' / '+count);


        }

        if (!sorted) {
            plots = unsorted;
        }

        let tableColumn = document.getElementById('column').value;
        let layout = {
          hovermode:'closest',
          title: title,
        };


        let traces = [];
        for (let p of plots) {
            traces.push({y:p.y, type: 'box', name: p.name, info: p.info, boxpoints: 'all'});
        }
        Plotly.newPlot('result_plot', traces, layout);
        let myPlot = document.getElementById('result_plot');
        myPlot.on('plotly_click', function(clicked){
            let data = clicked.points[0].data;
            for (let i=0; i<data.y.length; i++) {
                console.log(data.y[i], WPT_SERVER + '/result/' + data.info[i]);
            }
        });
    }

    function lazyGetPlot(plotTable, browser_name, browser_version, cached) {
        let colors = { 'Firefox': 'red', 'Google Chrome': 'gray', 'Nightly': 'blue'};
        let color = (cached ? 'light' : '') + colors[browser_name];

        let id = browser_name.substring(0, 16) + ' ' + browser_version + ' ' + (cached ? 'cached' : '');
        if (plotTable[id]) {
            return plotTable[id];
        }

        let sorted = $("#sorted").is(':checked');
        let mode = (sorted ? 'lines+' : '') + 'markers';
        plotTable[id] = {
            name: id,
            x: [],
            y: [],
            info: [],
            mode: mode,
            type: 'scatter',
            marker: { color: color },
            cached: cached,
            browser_name: browser_name,
            version: browser_version
        };
        return plotTable[id];
    }

    function processResult(plots, testid, allRows, browser_name, browser_version) {
        let net = lazyGetPlot(plots, browser_name, browser_version, 0);
        let cache = lazyGetPlot(plots, browser_name, browser_version, 1);

        let tableColumn = $('#column').val();

        let net_len = net.x.length - 1;
        let cache_len = cache.x.length - 1;

        for (let i = 0; i < allRows.length; i++) {
            let row = allRows[i];

            let y = row[tableColumn];
            let x = parseInt(row['Run']);
            let cached = parseInt(row['Cached']);
            let text = testid+'/'+x+'/details' + (cached ? '/cached' : '');

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

    function addDomain(domain) {
        $('#domains').append($('<li/>').click(function() {
            displayDomain(this.textContent);
            return false;
        }).append($('<a>', {
            href: '#',
            text: domain
        })));
    }

    function getDomains() {
        makeXHRRequest(PRESTO_SERVER + '/api/domains').then(responseText => {
            let domains = JSON.parse(responseText);
            domains.map(addDomain);

            $('#domains li a').click(function(e) {
                $('#domains li').removeClass('active');

                var $parent = $(this).parent();
                if (!$parent.hasClass('active')) {
                    $parent.addClass('active');
                }
                e.preventDefault();
            });

            if (domains.length > 0) {
                $('#domains li a:first').click();
            }
        });
    }

    function addBrowser(browser) {
        if (!browser.browser_name || !browser.browser_version) {
            return;
        }

        let tag = browser.browser_name + ' ' + browser.browser_version;
        let opt = $('<option>', {value: tag, text: tag});
        $('#browsers').append(opt);
    }

    function selectBrowser(browsers) {
        gBrowsers = browsers;
        console.log('browsers = ' + browsers);

        $("#browsers option:selected").removeAttr("selected");
        $('#browsers > option').each(function() {
            for (let b of browsers) {
                if (this.value.startsWith(b)) {
                    this.selected = true;
                    break;
                }
            }
        });

        if (gDomain) {
            displayDomain(gDomain);
        }
    }

    function getBrowsers() {
        makeXHRRequest(PRESTO_SERVER + '/api/browsers').then(responseText => {
            let browsers = JSON.parse(responseText);
            browsers.forEach(addBrowser);

            $('#browsers').attr({size: browsers.length});
            $('#cdp-bugs a:first').click();
        });
    }

    function addLabel(label) {
        // let opt = $('<option>', {value: label, text: label});
        // $('#test_label').append(opt);
        $('#' + label).removeClass('hidden');
    }

    function selectLabel(label) {
        gLabel = label;
        console.log('select label: ' + label);

        if (gDomain) {
            displayDomain(gDomain);
        }
    }

    function getLabels() {
        makeXHRRequest(PRESTO_SERVER + '/api/labels').then(responseText => {
            let labels = JSON.parse(responseText);
            labels.forEach(addLabel);
        });
    }

    function setupBugButtons() {
        $('#nightly').on('click', function() {
            selectLabel('nightly');
        })

        $('#059800dab5a748d75405654ef08f43fb79eeeabb').on('click', function() {
            selectLabel('059800dab5a748d75405654ef08f43fb79eeeabb');
        })

        $('#c76e1a0c770f2180e331bde73f081f4b063dd40f').on('click', function() {
            selectLabel('c76e1a0c770f2180e331bde73f081f4b063dd40f');
        })

        $('#cdp-bugs li a').click(function(e) {
            $('#cdp-bugs li').removeClass('active');

            var $parent = $(this).parent();
            if (!$parent.hasClass('active')) {
                $parent.addClass('active');
            }
            e.preventDefault();
        });

        $('#browsers').change(() => {
            $('#cdp-bugs li').removeClass('active');

            let browsers = [];
            $("#browsers option:selected").each(function() {
                browsers.push($(this).val());
            });

            selectBrowser(browsers);
        });
    }

    $(document).ready(function() {
        getDomains();
        getBrowsers();
        getLabels();
        setupBugButtons();

        $('#replot_btn').click(() => {
            displayDomain(gDomain)
        });
    });
})(this);
