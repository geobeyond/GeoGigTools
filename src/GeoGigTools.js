var GeoGigTools = (function() {

    return {
        //configs
        geoserverUrl: '',
        store: '',
        workspace: '',
        geom: '',
   

        init: function(options) {
	    this.geoserverUrl = options.geoserverUrl;
            this.store = options.store;
            this.workspace = options.workspace;
            this.geom = options.geom;
            if (options.proxyHost && typeof options.proxyHost!=='undefined')
                OpenLayers.ProxyHost = options.proxyHost;
        },

        error: function(name, msg) {
            return{
                name: name,
                message: msg,
                toString: function() {
                    return this.name+': '+this.message;
                }
            };
        }
    };
}());
