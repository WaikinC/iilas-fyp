"""Self-contained structural tests; TensorFlow only in explicit supervised worker."""
import base64
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import zlib

# Builtin MobileNetV2 graph metadata only, no learned weights or private samples.
_GRAPH = (
    "c-rlqYmcMI6^8$dKRYc`Tx{msUbIo9)n*lCzhpE**rvNlV{i=ao!Qa+_f!FGw{38{jO%ciewCh8e8B~WQ*XUh=TY%>l!mKl^kKBh"
    "=5Z3GQSmH-b+}nX$!I((HesBG^F)53*leTmC<(trn|$=)<5zjWa;rWVJw=-^zpFnPj}}Ro=Ry6e|47%{;#c*N`Xo#5<A>3QucLWb"
    "EFOdWF<i?peN4AWG8V!q|Jk3$qh;|$eK5LDvaqm)JT#Z5l*_m7!z7odu?Zg@qUG*o-Pq<~9!vt^y7GW*UBp=$CiQo|$z!62I4`12"
    "w5(6AY_{pxIGtzPRDLa6M(SEWeH&kRx&MmtMVQ3t!@<=aM>yDj=_J7Qr60F<+|bYemS6ilOX9_srlwv3*LK<ReRU4<)#Pq6na&*B"
    "vZumz{E6jzGI;m*c~p!({LQ+Xv`22fjgw`tZ#!1^y6vWZ8=niqam2rl!p%eVe-17?2+C*#MU>{*CI}9$T_c^UUwM>Qm2JMrLtfwh"
    "$$0YV+c$aG)1TEze3h>nG9ce9?&MohlHc8L(?y+bNB8NMgHKvBLiV|NxOkdpX>^zrb%L|*cGZ1P>eh5S-r>>LcfFso^jZAe6lL{^"
    ")fiTq&Nfz=sou)w|BV(!5X%S(+0R^iY72KVo5=(3<D@9>ur12$Ors>o<G<8xvdepu7n`^Wi5Ls{dL1s8s_%Rl<*FfhEnyJ`_t|C@"
    "%8ol)Jcg<Kja&vcFVv@T5~}+WY{EkQs5Q3ak34L$?OOh(H6DdBO`prJ$fISij6!ugws{oHV;PZ`h}EYSr*RR>&ij|VX(!>kd-dr_"
    "EdQQlo2>XFjn%0hcHc;)Ru!-+DZ<a{f~$A3ZE^V48EI2z+~E}e6K%5m^{Jg{s*Z>Jc$<Wqs<B!f)k!qGUj{lZzBGMS|C($#FO#)6"
    "__5=+Z?4QQ9i?|QKG1|q^|)CUepHh8o9Y(wW>@*$(1qt|Fa(tdKgYQmmB;c_R#94PS84$FeSbWP)_I($&Z`D=`Gtl2SS42FD(b<$"
    "dNGfrQqXjdhj6v(($+uI=+dTE*|XHcU=@Wa(Z$s*KFdBFri+N?GRvFSARSetn{-GWaH=TP_fOx?zod)DO_s`^*bnrZC{=2G_%c`|"
    "@p@g3LDix4+lQ&yNu(@Gl>cn;N~K=))!Pfzs}?U(s`^Y$HEOg9^QZc*ebbph{Q5_$hmp58*)o@?Rrp!<h-51d@$M$_rbQ1@b)Tak"
    "PqKA2-;fvZxQX(|ELoPX-?WGa7vKLq-zQ+Vq3P#nT|E97=TW<LjXtl#bQzW1<T+Tr9KbvW%JU3X+oXusNvx#Eddt*Se)J}$_ChDS"
    "3nt9$OH=!h+{n-Fe~`k`HjWnUJ&4KRQR^Co%Wa88@Z)drz3{#8y}W(z+1}f~n6(P6ac|rfn0M-y-v|fWOeqt&+c0>kkzQ{ybxVe_"
    "CTw}f_PKJpM(i`zgx~F&@CC!pzUT1Ok-iLd9UItb*lE~lj&|De-qJPGW?G)X71Fj7-J4nIcB3>;vc*$i1=Sf0#Uc4{NN`Am4(UKi"
    "PPz<J{kXvd>%waKK|tV#;D_LcIQk*KUByfrA^$=lJJwd?i-|{Jc&BTK%~9Z%4mTLklra5XnZomaSUN}Md9d@gA3si%Pc8rZ>Ab}?"
    "CnHt7*k#Nu)`l+NHeOo&j){$93|UH0yaciVWJ6Cv?DAiugqVgkc1>#uNhxfUvnX&Hm`GtF#d0F$dg|}Ic$u0>?b_B-FG?=sG!*ZA"
    "HbuZ<bj%8)490E*9Tt5d9Ml$2TQKj1&kQCesf(_PK}TC0MFVyib{KY;pB)xXyMmcD!?I<)sXRGXAqK`(SPsk&%nzCQX^;+K607JW"
    "8^kz;08Rnh1KY#a_Q;{KRlLmF9@VmjfC*}tLI9>{hyt^0xWQ<4aa~+sCj*qlQ5L^$L@`?x@1`NtYk>mAaoA$m;^En1qUyM|j?tIL"
    "1<K>Cf#8=G1od%&`Z$(|u|%vlo|rF?chC%aSBwfdJTW}+kSgSYV})E8sF44#T%J>|aLKzie(l{qz6nRK8}gxwL~A1SU-TUJlZ&q{"
    "xG4{A1Ji&9hX>afzie)pMlGOpuG<Em0n-iBJ*b6fn<JlLQ}Y=%_>6`qFv|wIy)JC*b)lyrrnb81mM^3`UD(*^0!R;#o^t{+Re#L_"
    "Vi@V!wX7v0#QR*>KzT5O!VHS%3`)$@-y7m(Y7(_?TuZ;`Q63v8Pir9fr3C@XV-F4GIeqvv$_OYU7<l;fneoIV%F|ghs8JppC=Wa_"
    "JTYHSeE4MQrao&*#V&qY@v*LwZFb=djiT^je_(&e>`#MqI3_8IPO?F~*@Xj`0=5UXhwoCL-!5K;*8zPk0duHf3I{MnLll^01LbBH"
    "4mP_$WgM09>qZo_mGN#GLcJE~ph6B?3|l-rTTE3U*VQrl3b}&{d21l}r3FES+(CsLOT<_r)*DX<D&*H|2E8jrg&dw3o_I(Va))Du"
    "+@ap=!uifOyV&1^qt^}jU~IFCTNORW{p2FWW*06n4R~;PaE<ZH<%VfE)SF$n;4@&lVY&yk5bbj0GhAvu!v&ww5Cvx0K*?vg;4{Ey"
    "fX}#YL}AEhxP9>%F8B=CV%Xy0*<zl2hT8+5;eyX-4FtcmAmB4x@EKSe#@evnc*2g)aC_u4T<{t2#PGy};xk;1e1=QSXSm=qjv~Q?"
    "&p4=dj{8YM3NXV1m;v(*^Q|#(dECGZmm19Q0A|2#!)*_01=`~XW_Z+Kh6gaCAqvd0f$k|J9-cy?ry-`ELeec?NS{LD;VC3wdBF0V"
    "6A)khH4BJgmS@+pmW&WTg~S8HgBcWNP&{W)mQ((n7cWzjsD0yF`bE$1cwl&11HmsX2pAr3Xbg{shnb^{KwyT?jVC4<p3a&<&G2|&"
    "c;JcQiTQeB&uN!1vxeAnH0Sf=Pa&BOjH0k-us^UrWcH^)I;JKmicYdY{1lQYU<%kC*dDgFM-G*(;$_zMsFpPZY)TDNOaW6gM1fg0"
    "Q0{Uu#V!}9jH5Ds-H2kgGTu!?sMi9gsF1@J!xj(E786y-wRMcXLOw->yfqN~(t@BuK1GEbOT<_r)*DaESI9eP2E8jrg&dw3o_I(V"
    "@+rp(`ILH>i|Kd1%f<dC9KCMH2V=Wj+^Xm~?k5*1HoKSs(|`wu2iF+CX5281DfMO-Gw>NO-7wvQT8N%;<TGZ}e8voXMne>sWdkLj"
    "F$13gJ_CHlbt4KxK4aDwpD_cU0b2}PJUm;>lh2s-z-P?BXS4=_Us@3G88h%1SR2OLu-<sWj?b9&$Y;#JXTTG~6Ay~dm~rGYX4HJf"
    "41C5>B$)6S)7w0Sq*D@7fEhl(447}2Z;gS==LTlXsKE>$U<TYa-1eYWpnZ;DhEEM<_y98+qQER0D8URLU<SYpfEm|~C=9_2zb`Pu"
    "2bcj{3|l-rTg(&8@OuC=e1I9Pf#8=G1Ym{_FavADSR2+GPuPJOeve>=4=@9s7@l}gV1~~T%<!qf3?E>|Q6!jv8MFSt44)FruqGfg"
    ";J)F$HAb%2U53lBMT}<bLIA@J!wthdj78|9PRnH7;FX#ZEkN(%@UEAiPr|@0At(V2*(eAN5E>vft{YbvA{xi?Mrw`$X}}-D9}mwT"
    "^Q1Hm1(wbwgVSh@1jEcAAT?xj14A`@4~xZEEbiGIvtu<H6php#gVumKhB;<yj(zWpikWrBvS~dXyFIV*rU|kJRxx*{FhMXuWG1Ld"
    "JuLGT^J|sk2Gb@j_hX@Q4)X)^!`A%B(Xw5?%$gt7w2p>Z<dt&^mGh=Ba7zf%%DIKgIV$I<oL@PvP*l#ZmJ#x$K?{|0_+$9v0s3R2"
    "%DKLj^-wvtP&sdp1jEdrsGM7<oMX`#i^iIxiuuZU7uo2+9;0#&a}0AlsLHv;vT|-w?{pwrd=Fb4sM~P#x+x_L?{#p4V(7T1d?eZQ"
    "Kmg%@8;2X$8O8)Vgu^1=^+15#fc=L39@g5lV99O>a&|+2-DnB}w}c>NHw4%Xup3}Et{hi5vKyi|c0+*OfIo&m9-u#F%5I20*bM=8"
    "qdgJ~GlPQN5MVd3T8!0V%~6FPyCM2yHw4%Xm}8jZVX+&6CA%TW*$n}9<2V#t*bVEJ530B}5lNs88_))9IBdAi_+_($HUv4eVFTKL"
    "?}qOl)}pk{656oIp$!|*MpGELCBzL@p_MfKUKznRT(Go@%rjwUXg_|OD05o=_tSY_Yfee3c(F^FTdY7{PWss2GwCD7;$RvjRVZEp"
    "^#SUmr6I2RYtazHsL!rxJtZlXjdUsn#0Rq}%%)h*rl#_LZ>g85>C{Wxdh*o+-eUvrX^#ZEyr6)4?4iLumN!9J0c8dAhWN~YVv_CY"
    "su|>Dj}5X1o*15(t0$J@<rxVx>4;U!niG2Zr<phdqbhvZAJ`u%`_rf$j!CGZlWtHy%fta%0pkPX!_@fr=fumT@9{PD%OS@q9AFhq"
    "Vc?Yxq&s0a*a-vWag@ie8d1y^$2&;~`C_1h5;<HkT=C#sF-eJBU&eYUkvk}nw?~3qUQm?C9hAtiMvOILy#d8^iM)$u^x%q7B8Ml2"
    "CmvFX+~HUvcgVNCaK7`cFLrm~@MTjz7~A;bRz=ToKe<S<`-KZm10Eb6Tw?%pxp5i}`Q8^U01en~*zO@MMY{|E4VN6yZ~<sEg@IQ("
    "kOCSm01W^d05q-|QTPEGZf}5w3qS*|7_NA5u9zjD;r0P&xBxWTBf%~&C;$x?fCd(au{f+Zpl|~;+&%#f7k~ylF+B0001cNTpy84O"
    "8ZH2h!$2?rG@RQ!n50t@l8_l5$PAcom~V}d%i~67xa4Gp2QmYG8-9C8YtSA;GQ%S$Gdz$PO<~}b4y0s;2QmX>2FQ%7MihQzhSwXJ"
    ";epJ6D~2l`oGWHYW_W#&86L=t_DHbH3kovB8ycBm3oH&}akyVo%#F<O`Xn<vkQwmA@Wfm_u^cbYNSH}StXkGnG0LY)s80fGFg&W5"
    "Y1^JI51EDUdDp(@P&9U3g_%x}Jx!ttKrm0?Z{Tm>Z+MZXa%4Qws;a9RLU&Yy7wOfDZW>?RlSANpUCw)T={#<CnR?BG(x(^uQr}&9"
    "%&XVcQ9D1g|IYpr%b#tC$mo}Cx=@2xn2g@&IJHbHvei0HqTscp)W5aL=JJy?DxO6!4;N4KEHzX76T&I~*_VZPcV2-St(2}bb*wV~"
    "OVO#*|GJ(g&FDN#et4E&d62y#Q|&d+BOc0c24VHpU|oOr2)3<8Rz{$~**U>e6s?!>>c!l@*$L0YpzluEoXs7{lTEgkowDiPEO#F<"
    "zWLQmZ*nKb2UDvwQ|pI^I&uEK@2~duxB2p0+@5`J>w_L}l$IF8$vsKS`9rV_SF(NP9e*orrVNBQn%C#qeIbYEgNc20>X_Geo!9Hl"
    "-N&Q<ZNs#vXQR6Ty7RRD$S0rVY@a=Nrz02prp?1Vm;}OgTV2!f1(rYkf4Xg6Vg"
)

def graph_fixture():
    return json.loads(zlib.decompress(base64.b85decode(_GRAPH)))

def helper(test):
    spec = importlib.util.find_spec("parcel_finetune")
    test.assertIsNotNone(spec, "tail-only candidate helper is not implemented")
    import parcel_finetune
    return parcel_finetune


def expected_weights():
    # Independently enumerated MobileNetV2 alpha=1.0 channel schedule.
    result = {}
    def conv(name, shape): result[name] = [("kernel", shape)]
    def bn(name, channels):
        result[name] = [(n, (channels,)) for n in
                        ("gamma", "beta", "moving_mean", "moving_variance")]
    conv("Conv1", (3, 3, 3, 32)); bn("bn_Conv1", 32)
    conv("expanded_conv_depthwise", (3, 3, 32, 1))
    bn("expanded_conv_depthwise_BN", 32)
    conv("expanded_conv_project", (1, 1, 32, 16)); bn("expanded_conv_project_BN", 16)
    channels = [16,24,24,32,32,32,64,64,64,64,96,96,96,160,160,160,320]
    for i in range(1,17):
        before, after = channels[i-1:i+1]; expanded = before*6
        prefix = f"block_{i}_"
        conv(prefix+"expand", (1,1,before,expanded)); bn(prefix+"expand_BN", expanded)
        conv(prefix+"depthwise", (3,3,expanded,1)); bn(prefix+"depthwise_BN", expanded)
        conv(prefix+"project", (1,1,expanded,after)); bn(prefix+"project_BN", after)
    conv("Conv_1", (1,1,320,1280)); bn("Conv_1_bn",1280)
    result["normal_damaged"] = [("kernel", (1280,2)), ("bias", (2,))]
    return result

class Variable:
    def __init__(self, path, shape):
        import numpy as np
        self.path = path; self.name = path.rsplit("/",1)[-1]
        self.value = np.zeros(shape,dtype="float32")
        self.shape = self.value.shape; self.dtype = "float32"
    def numpy(self): return self.value

class Layer:
    def __init__(self, config):
        self.name = config["config"]["name"]
        self.config = copy.deepcopy(config["config"])
        self.kind = config["class_name"]
        self.trainable = True
        self.weights = [Variable(self.name+"/"+n,s) for n,s in expected_weights().get(self.name,[])]
        self.layers = [make_layer(c) for c in self.config.get("layers",[])]
        if self.layers: self.weights = [w for l in self.layers for w in l.weights]
    @property
    def trainable_weights(self):
        if not self.trainable:return []
        if self.layers:return [w for l in self.layers for w in l.trainable_weights]
        return [w for w in self.weights if not w.name.startswith("moving_")]

def make_layer(config):
    return type(config["class_name"],(Layer,),{})(config)

class Model:
    def __init__(self):
        self.config = graph_fixture(); self.name = "mobilenetv2_parcel"
        self.layers = [make_layer(c) for c in self.config["layers"]]
        self.input_shape = (None,224,224,3); self.output_shape = (None,2)
        self.trainable = True
    def get_config(self): return copy.deepcopy(self.config)
    @property
    def weights(self): return [w for l in self.layers for w in l.weights]
    @property
    def variables(self): return self.weights
    @property
    def trainable_weights(self):
        return [w for l in self.layers for w in l.trainable_weights] if self.trainable else []

class TailContractTests(unittest.TestCase):
    def test_import_has_no_tensorflow_or_checkpoint_side_effect(self):
        helper(self)
        code = "import sys; import parcel_finetune; assert 'tensorflow' not in sys.modules; assert 'keras' not in sys.modules"
        r = subprocess.run([sys.executable,"-c",code],capture_output=True,text=True,cwd=Path(__file__).parent)
        self.assertEqual(r.returncode,0,r.stderr)

    def test_only_exact_twelve_tail_and_head_weights_train(self):
        h=helper(self); m=Model(); out=h.configure_tail(m)
        expected = [f"block_{i}_{part}/kernel" for i in (14,15,16) for part in ("expand","depthwise","project")]
        expected += ["Conv_1/kernel","normal_damaged/kernel","normal_damaged/bias"]
        self.assertEqual([v["name"] for v in out["trainable_variables"]],expected)
        self.assertEqual(out["trainable_variable_count"],12)
        self.assertEqual(out["trainable_parameter_count"],1513282)
        self.assertTrue(all(not l.trainable for l in m.layers[2].layers if l.kind=="BatchNormalization"))
        self.assertFalse(m.layers[2].layers[1].trainable)
        self.assertEqual(out,h.configure_tail(m))

    def test_extra_missing_renamed_wrong_config_graph_is_rejected(self):
        h=helper(self)
        for mutate in (
            lambda m:m.config["layers"].append(copy.deepcopy(m.config["layers"][-1])),
            lambda m:m.config["layers"].pop(),
            lambda m:m.config["layers"][2]["config"]["layers"].pop(),
            lambda m:m.config["layers"][2]["config"].update(name="efficientnetb0_backbone"),
            lambda m:m.config["layers"][-1]["config"].update(activation="sigmoid"),
            lambda m:m.config["layers"][-2]["config"].update(rate=.3),
            lambda m:m.config["layers"][1]["config"].update(scale=1.),
            lambda m:m.config["layers"][2]["inbound_nodes"][0]["kwargs"].update(training=True),
        ):
            m=Model();mutate(m)
            with self.subTest(config=m.config["layers"][-1]["config"]["name"]):
                with self.assertRaises(ValueError):h.configure_tail(m)

    def test_actual_layer_or_weight_shape_not_just_config_is_checked(self):
        h=helper(self)
        for mutate in (
            lambda m:m.layers.pop(),
            lambda m:setattr(m.layers[2].layers[-3],"name","unexpected"),
            lambda m:setattr(m.layers[-1].weights[0],"shape",(640,2)),
            lambda m:setattr(m,"input_shape",(None,112,112,3)),
            lambda m:setattr(m,"output_shape",(None,1)),
            lambda m:m.layers[-1].weights.append(Variable("normal_damaged/extra",(2,))),
        ):
            m=Model();mutate(m)
            with self.assertRaises(ValueError):h.configure_tail(m)

    def test_fingerprints_separate_bn_and_ignore_only_trainable_when_requested(self):
        h=helper(self);m=Model();h.configure_tail(m)
        all_before=h.weight_fingerprints(m); frozen_before=h.weight_fingerprints(m,True)
        self.assertIn("bn_Conv1/moving_mean",all_before["batch_normalization"])
        self.assertNotIn("normal_damaged/kernel",frozen_before["learned_weights"])
        m.layers[-1].weights[0].value[0,0]=1
        self.assertNotEqual(all_before,h.weight_fingerprints(m))
        self.assertEqual(frozen_before,h.weight_fingerprints(m,True))
        m.layers[2].layers[2].weights[2].value[0]=1
        self.assertNotEqual(frozen_before,h.weight_fingerprints(m,True))

    def test_random_generator_state_is_separate_from_learned_weights(self):
        h=helper(self);m=Model();h.configure_tail(m)
        seed=Variable("seed_generator/seed_generator_state",(2,))
        with patch.object(Model,"variables",property(lambda s:s.weights+[seed])):
            before=h.weight_fingerprints(m); seed.value[0]=1;after=h.weight_fingerprints(m)
        self.assertEqual(before["learned_weights"],after["learned_weights"])
        self.assertNotEqual(before["random_generator_state"],after["random_generator_state"])

    def test_load_and_gradient_refuse_unsupervised_before_tensorflow_import(self):
        h=helper(self)
        from runner_runtime import RuntimeSafetyError
        for environment in ({}, {"IILAS_RUNNER_JOB":"Local\\IILASNativeRunner-fake"}):
            with patch.dict("os.environ",environment,clear=True):
                with self.assertRaises(RuntimeSafetyError):h.load_candidate(Path("missing.keras"))
                with self.assertRaises(RuntimeSafetyError):h.gradient_probe(Model(),None,None,None)
        self.assertNotIn("tensorflow",sys.modules)

    def test_probe_batch_shape_labels_and_weights_are_admitted_without_tf(self):
        h=helper(self)
        import numpy as np
        good=np.zeros((4,224,224,3),dtype="float32")
        bad_cases=[(good[:3],[0,1,0],[1,1,1]),(good,[0,1,0,2],[1]*4),
                   (good,[0.,1.,0.,1.],[1]*4),(good,[0,1,0,1],[1,0,1,1]),
                   (good,[0,1,0,1],[1,1,float("nan"),1]),
                   (np.full_like(good,float("nan")),[0,1,0,1],[1]*4),
                   (good,[0,1,0,1],[[1],[1],[1],[1]])]
        for args in bad_cases:
            with self.subTest(labels=args[1]):
                with self.assertRaises(ValueError):h._probe_arrays(*args)
        x,y,w=h._probe_arrays(good,[0,1,0,1],[.2,.4,1.3,1.8])
        self.assertEqual(x.shape,(4,224,224,3));self.assertEqual(w.tolist(),[.2,.4,1.3,1.8])

    def test_missing_nonfinite_wrong_shape_or_all_zero_gradients_fail_closed(self):
        h=helper(self)
        self.assertTrue(hasattr(h,"_gradient_summary"),"gradient admission not implemented")
        import numpy as np
        variables=[Variable("a/kernel",(2,)),Variable("b/kernel",(1,))]
        good=[np.array([0.,3.]),np.array([4.])]
        summary=h._gradient_summary(variables,good)
        self.assertEqual([v["l2_norm"] for v in summary],[3.,4.])
        self.assertEqual([v["name"] for v in summary],["a/kernel","b/kernel"])
        for bad in ([None,good[1]],[np.array([float("nan"),0.]),good[1]],
                    [np.array([float("inf"),0.]),good[1]],good[:1],
                    [np.array([1.]),good[1]],[np.zeros(2),np.zeros(1)]):
            with self.assertRaises(ValueError):h._gradient_summary(variables,bad)

def software_worker(output):
    """Random, uncompiled builtin model; never a parcel/model-quality claim."""
    from runner_runtime import require_supervised_worker, write_json_exclusive
    require_supervised_worker()
    from parcel_train import worker_environment
    worker_environment(output)
    import numpy as np
    import tensorflow as tf
    import parcel_finetune as h
    tf.config.set_visible_devices([], "GPU")
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    tf.keras.backend.clear_session()
    tf.keras.utils.set_random_seed(42)
    backbone = tf.keras.applications.MobileNetV2(
        include_top=False, weights=None, input_shape=(224,224,3), name="mobilenetv2_backbone")
    backbone.trainable = False
    inputs = tf.keras.Input(shape=(224,224,3),name="rgb_0_255")
    x = tf.keras.layers.Rescaling(1./127.5,offset=-1.,name="mobilenet_scaling")(inputs)
    x = backbone(x,training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(.2)(x)
    outputs = tf.keras.layers.Dense(2,activation="softmax",name="normal_damaged")(x)
    model = tf.keras.Model(inputs,outputs,name="mobilenetv2_parcel")
    model.get_layer("normal_damaged").bias.assign([.2,-.2])
    assert not hasattr(model,"optimizer")
    path = Path(output)/"software-only.keras"
    model.save(path)
    model = h.load_candidate(path)
    assert not hasattr(model,"optimizer")
    inventory = h.configure_tail(model)
    assert inventory["trainable_variable_count"] == 12
    assert inventory["trainable_parameter_count"] == 1513282
    images = np.random.default_rng(42).uniform(0,255,(4,224,224,3)).astype("float32")
    labels = np.array([0,1,0,1],dtype="int32")
    weights = np.array([.2,.4,1.3,1.8],dtype="float64")
    probabilities = model(images,training=False).numpy()
    expected_loss = float(np.sum(-np.log(probabilities[np.arange(4),labels])*weights)/4.)
    before = h.weight_fingerprints(model)
    # Construction and steps both fail if the probe gains an optimizer later.
    with patch.object(tf.keras.optimizers.Adam,"__init__",side_effect=AssertionError("optimizer forbidden")):
        report = h.gradient_probe(model,images,labels,weights)
    assert before == h.weight_fingerprints(model) == report["before"] == report["after"]
    assert report["sample_weights"] == weights.tolist()
    assert report["training"] is False
    assert report["timings_seconds"]["warmup"] > 0
    assert len(report["timings_seconds"]["timed_passes"]) == 3
    assert len(report["gradients"]) == 4
    for grad in report["gradients"]:
        assert abs(grad["loss"]-expected_loss) < 1e-6
        assert [v["name"] for v in grad["variables"]] == [v["name"] for v in inventory["trainable_variables"]]
        assert all(v["finite"] for v in grad["variables"])
        assert any(v["nonzero"] for v in grad["variables"])
    # Existing compiled fit may subsequently change only the allowed variables.
    frozen_before = h.weight_fingerprints(model,True)
    trainable_before = h.weight_fingerprints(model)
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-5),loss="sparse_categorical_crossentropy")
    model.train_on_batch(images,labels,sample_weight=weights)
    frozen_after = h.weight_fingerprints(model,True)
    assert frozen_before["learned_weights"] == frozen_after["learned_weights"]
    assert frozen_before["batch_normalization"] == frozen_after["batch_normalization"]
    assert frozen_before["random_generator_state"] != frozen_after["random_generator_state"]
    assert trainable_before["learned_weights"] != h.weight_fingerprints(model)["learned_weights"]
    write_json_exclusive(Path(output)/"software-test.json",{
        "evidence":"random-software-only", "tensorflow":tf.__version__,
        "safe_uncompiled_load":True,"gradient_report":report,
        "frozen_weights_and_bn_after_fit":True,"allowed_weights_change_after_fit":True})


if __name__ == "__main__":
    if len(sys.argv)==3 and sys.argv[1]=="--software-worker":
        software_worker(sys.argv[2])
    else:
        unittest.main()
