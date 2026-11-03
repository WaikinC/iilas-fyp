import type {CapacitorConfig} from '@capacitor/cli';
const config:CapacitorConfig={appId:'com.iilas.fyp.driverdemo',appName:'IILAS Driver Demo',webDir:'dist/mobile',android:{allowMixedContent:true},server:{hostname:'localhost',androidScheme:'https'},plugins:{CapacitorHttp:{enabled:false}}};
export default config;
