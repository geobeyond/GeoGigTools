/*
 * Requires ./GeoGigTools.js and OpenLayers
 */

GeoGigTools.Layers = (function() {

    var format = new OpenLayers.Format.WMSCapabilities();
    var wkt = new OpenLayers.Format.WKT();

    var csvToArray = function(strData, strDelimiter) {
        // Check to see if the delimiter is defined. If not,
        // then default to comma.
        strDelimiter = (strDelimiter || ",");

        // Create a regular expression to parse the CSV values.
        var objPattern = new RegExp(
            (
                // Delimiters.
                "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +

                // Quoted fields.
                "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

                // Standard fields.
                "([^\"\\" + strDelimiter + "\\r\\n]*))"
            ),
            "gi"
        );


        // Create an array to hold our data. Give the array
        // a default empty first row.
        var arrData = [
            []
        ];

        // Create an array to hold our individual pattern
        // matching groups.
        var arrMatches = null;


        // Keep looping over the regular expression matches
        // until we can no longer find a match.
        while (arrMatches = objPattern.exec(strData)) {

            // Get the delimiter that was found.
            var strMatchedDelimiter = arrMatches[1];

            // Check to see if the given delimiter has a length
            // (is not the start of string) and if it matches
            // field delimiter. If id does not, then we know
            // that this delimiter is a row delimiter.
            if (
                strMatchedDelimiter.length &&
                strMatchedDelimiter !== strDelimiter
            ) {

                // Since we have reached a new row of data,
                // add an empty row to our data array.
                arrData.push([]);

            }

            var strMatchedValue;

            // Now that we have our delimiter out of the way,
            // let's check to see which kind of value we
            // captured (quoted or unquoted).
            if (arrMatches[2]) {

                // We found a quoted value. When we capture
                // this value, unescape any double quotes.
                strMatchedValue = arrMatches[2].replace(
                    new RegExp("\"\"", "g"),
                    "\""
                );

            } else {

                // We found a non-quoted value.
                strMatchedValue = arrMatches[3];

            }


            // Now that we have our value string, let's add
            // it to the data array.
            arrData[arrData.length - 1].push(strMatchedValue);
        }

        // Return the parsed data.
        return (arrData);
    };

    var groupGeoGigResponseByCommit = function(arr, fidOnly) {
        var keys = arr[0];
        if (keys.length > 1) {
            //rimuovi primo elemento e ultimo
            arr.shift();
            if (arr[arr.length - 1].length === 1)
                arr.pop();

            var orig = [];
            for (var i = arr.length - 1; i >= 0; i--) {
                var obj = new Object;
                for (var j = 0; j < keys.length; j++)
                    obj[keys[j]] = arr[i][j];
                orig.push(obj);
            }
            var newArr = [],
                types = {},
                newItem, i, j, cur;
            for (i = 0, j = orig.length; i < j; i++) {
                cur = orig[i];
                if (!(cur.CommitId in types)) {
                    types[cur.CommitId] = {
                        'CommitId': cur['CommitId'],
                        'Author Commit Time': cur['Author Commit Time'],
                        'Author Email': cur['Author Email'],
                        'Author Name': cur['Author Name'],
                        'Commit Message': cur['Commit Message'],
                        'Committer Commit Time': cur['Committer Commit Time'],
                        'Committer Email': cur['Committer Email'],
                        'Committer Name': cur['Committer Name'],
                        'Parent CommitIds': cur['Parent CommitIds'],
                        features: []
                    };
                    newArr.push(types[cur.CommitId]);
                }
                delete(cur['Author Commit Time']);
                delete(cur['Author Email']);
                delete(cur['Author Name']);
                delete(cur['Commit Message']);
                delete(cur['Committer Email']);
                delete(cur['Committer Name']);
                delete(cur['Parent CommitIds']);
                if (fidOnly) {
                    types[cur.CommitId].features.push({
                        'FeatureId': cur.FeatureId,
                        'ChangeType': cur.ChangeType
                    });
                } else {
                    types[cur.CommitId].features.push(cur);
                }
            }
            return newArr;
        } else {
            throw GeoGigTools.error('groupGeoGigResponseByCommit()', 'XML non valido');
            return false;
        }
    };

    var buildFeaturesForCommit = function(objs, allCommits) {
        var historyFeatures = [];

        var removeFeature = function(fid) {
            for (var j = 0; j < historyFeatures.length; j++) {
                if (historyFeatures[j].FeatureId === fid)
                    historyFeatures.splice(j, 1);
            }
        };

        var addFeature = function(feature) {
            historyFeatures.push(feature);
        };

        for (var i = 0; i < objs.length; i++) {
            var features = objs[i].features;
            for (var j = 0; j < features.length; j++) {
                switch (features[j].ChangeType) {
                    case 'ADDED':
                        addFeature(features[j]);
                        break;
                    case 'REMOVED':
                        removeFeature(features[j].FeatureId);
                        break;
                    case 'MODIFIED':
                        var fid = features[j].FeatureId.substring(0, features[j].FeatureId.indexOf('->') - 1);
                        removeFeature(fid);
                        features[j].FeatureId = fid;
                        addFeature(features[j]);
                        break;
                    default:
                        break;
                }
            }
            if (allCommits) {
                objs[i].features = [];
                for (var j = 0; j < historyFeatures.length; j++) {
                    objs[i].features.push(historyFeatures[j]);
                }
            } else {
                if (i === objs.length - 1) {
                    objs[i].features = [];
                    for (var j = 0; j < historyFeatures.length; j++) {
                        objs[i].features.push(historyFeatures[j]);
                    }
                }
            }
        }
        if (allCommits)
            return objs;
        else
            return objs[objs.length - 1].features;
    };


    return {
        //lista di tutti i layer presenti sul server
        list: function(callback) {
            OpenLayers.Request.GET({
                url: GeoGigTools.geoserverUrl + '/wms',
                params: {
                    SERVICE: "WMS",
                    VERSION: "1.0.0",
                    REQUEST: "GetCapabilities"
                },
                success: function(results) {
                    var doc = results.responseXML;
                    if (!doc || !doc.documentElement) {
                        doc = results.responseText;
                    }
                    var capabilities = format.read(doc);
                    if (capabilities.capability && typeof capabilities.capability !== 'undefined') {
                        var layers = capabilities.capability.layers;
                        var retLayers = [];
                        for (var i = 0; i < layers.length; i++) {
                            var GeoGigIdentifier = false;
                            if (layers[i].identifiers.GeoGig_ENTRY_POINT && typeof layers[i].identifiers.GeoGig_ENTRY_POINT !== 'undefined')
                                GeoGigIdentifier = layers[i].identifiers.GeoGig_ENTRY_POINT;
                            retLayers.push({
                                name: layers[i].name,
                                bbox: layers[i].bbox,
                                //    styles: layers[i].styles,
                                srs: layers[i].srs,
                                //    formats: layers[i].formats,
                                queryable: layers[i].queryable,
                                GeoGigIdentifier: GeoGigIdentifier
                            });
                        }
                        var ret = {
                            response: {
                                success: 'true',
                                layers: retLayers
                            }
                        };
                        callback(null, JSON.stringify(ret));
                    } else {
                        throw GeoGigTools.error('list()', 'XML non valido.');
                        callback(true, null);
                    }
                },
                failure: function() {
                    throw GeoGigTools.error('list()', 'mancata ricezione risposta dal server.');
                    callback(true, null);
                }
            });
        },


        getAllVersionsInfo: function(idLayer, callback) {
            OpenLayers.Request.GET({
                url: GeoGigTools.geoserverUrl + '/GeoGig/' + GeoGigTools.workspace + ':' + GeoGigTools.store + '/log?path=' + idLayer + '&output_format=csv&summary=true',
                success: function(results) {
                    var arr = csvToArray(results.responseText, ',');
                    var objs = groupGeoGigResponseByCommit(arr, true);
                    var response = buildFeaturesForCommit(objs, true);
                    callback(null, JSON.stringify({
                        success: 'true',
                        commits: response
                    }));
                },
                failure: function() {
                    throw GeoGigTools.error('getAllVersionsInfo()', 'mancata ricezione risposta dal server.');
                    callback(true, null);
                }
            });
        },

        getFeaturesByVersion: function(idLayer, version, callback) {
            OpenLayers.Request.GET({
                url: GeoGigTools.geoserverUrl + '/GeoGig/' + GeoGigTools.workspace + ':' + GeoGigTools.store + '/log?path=' + idLayer + '&output_format=csv&summary=true&until=' + version,
                success: function(results) {
                    var arr = csvToArray(results.responseText, ',');
                    var objs = groupGeoGigResponseByCommit(arr, false);
                    var response = buildFeaturesForCommit(objs, false);
                    callback(null, JSON.stringify({
                        success: 'true',
                        features: response
                    }));
                },
                failure: function() {
                    throw GeoGigTools.error('getFeaturesByVersion()', 'mancata ricezione risposta dal server.');
                    callback(true, null);
                }
            });
        },

        getLayerMap: function(idLayer, version, geom, callback) {
            OpenLayers.Request.GET({
                url: GeoGigTools.geoserverUrl + '/GeoGig/' + GeoGigTools.workspace + ':' + GeoGigTools.store + '/log?path=' + idLayer + '&output_format=csv&summary=true&until=' + version,
                success: function(results) {
                    var arr = csvToArray(results.responseText, ',');
                    var objs = groupGeoGigResponseByCommit(arr, false);
                    var response = buildFeaturesForCommit(objs, false);

                    var features = [];
                    for (var i = 0; i < response.length; i++) {
                        if (typeof response[i][geom] !== 'undefined') {
                            if (response[i][geom]) {
                                var f = wkt.read(response[i][geom]);
                                features.push(f);
                            } else {
                                throw GeoGigTools.error('getLayerMap()', 'valore della geometria non valido.');
                                callback(true, null);
                            }
                        } else {
                            throw GeoGigTools.error('getLayerMap()', 'attributo ' + geom + ' inesistente.');
                            callback(true, null);
                        }
                    }
                    callback(null, features);
                },
                failure: function() {
                    throw GeoGigTools.error('getLayerMap()', 'mancata ricezione risposta dal server.');
                    callback(true, null);
                }
            });
        },

        getVersionedInfoSelectableGeometry: function(idLayer, geom, geometry, callback) {
            //console.log( GeoGigTools.geoserverUrl+'/GeoGig/'+GeoGigTools.workspace+':'+GeoGigTools.store+'/log?path='+idLayer+'&output_format=csv&summary=true');
            var allowedDist = 0.0002;
            OpenLayers.Request.GET({
                //url: GeoGigTools.geoserverUrl+'/GeoGig/'+GeoGigTools.workspace+':'+GeoGigTools.store+'/log?path='+idLayer+'&output_format=csv&summary=true',
                //url: 'http://192.168.1.108:8080/geoserver'+'/GeoGig/'+GeoGigTools.workspace+':'+GeoGigTools.store+encodeURIComponent('/log?path=')+idLayer+encodeURIComponent('&output_format=csv&summary=true'),
                url: GeoGigTools.geoserverUrl + '/GeoGig/' + GeoGigTools.workspace + ':' + GeoGigTools.store + '/log',
                params: {
                    path: idLayer,
                    output_format: 'csv',
                    summary: 'true'
                },
                proxy: GeoGigTools.proxyHost,
                success: function(results) {
                    //alert(results.getAllResponseHeaders());
                    var arr = csvToArray(results.responseText, ',');
                    var objs = groupGeoGigResponseByCommit(arr, false);
                    var response = buildFeaturesForCommit(objs, false);

                    var points = geometry.components[0].components;

                    var foundedFeature = null;
                    for (var i = 0; i < response.length; i++) {
                        if (foundedFeature === null) {
                            if (typeof response[i][geom] !== 'undefined') {
                                if (response[i][geom]) {
                                    var a = response[i][geom];

                                    var f = wkt.read(response[i][geom]).geometry.components[0].components;

                                    if (points.length === f.length) {
                                        var found = false;
                                        for (var j = 0; j < points.length; j++) {
                                            var dist = points[j].distanceTo(f[j]);

                                            if (dist < allowedDist)
                                                found = true;
                                            else
                                                found = false;

                                            if (j === points.length - 1) {
                                                if (found)
                                                    foundedFeature = response[i];
                                                else
                                                    foundedFeature = null;
                                            }
                                        }
                                    }
                                } else {
                                    throw GeoGigTools.error('getVersionedInfoSelectableGeometry()', 'valore della geometria non valido.');
                                    callback(true, null);
                                }
                            } else {
                                throw GeoGigTools.error('getVersionedInfoSelectableGeometry()', 'attributo ' + geom + ' inesistente.');
                                callback(true, null);
                            }
                        } else
                            break;
                    }
                    callback(null, JSON.stringify(foundedFeature));
                }
            });
        }
    };


}());