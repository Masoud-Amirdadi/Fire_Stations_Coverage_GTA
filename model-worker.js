'use strict';
importScripts('vendor/turf.min.js', 'model-core.js');
self.onmessage = ({data}) => {
    try {
        const result = CityModel.run(data, message => self.postMessage({progress:message}));
        self.postMessage({result});
    } catch (error) { self.postMessage({error:error.message || 'Calculation failed.'}); }
};
