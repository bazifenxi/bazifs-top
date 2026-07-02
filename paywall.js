/**
 * 八字工具付费墙系统 V3
 * 修复：微信X5浏览器 inline onclick 不触发 → 改用 addEventListener(click+touchend)
 */
(function() {
    'use strict';

    var PREMIUM_CARDS = ['familyCard','healthCard','ganzhiRelationsCard','shenshaCard','yunweiCard','dayunCard','liunianCard','liuyueCard','plainLanguageCard','combinationCard','tiaohouCard','gejuCard','zuogongCard','careerCard'];
    var API = 'https://bazi.zhongyi-note.top/bazi-api/pay';
    var SK = 'bazi_premium_activated', AK = 'bazi_activation_method', CK = 'bazi_activation_code', SHK = 'bazi_share_count';
    var isPremium = false, aMethod = '', shareCount = 0, aCode = '', lockedCard = null, shareToken = '', pollTimer = null, observer = null;
    var saved = new Map();

    // 微信X5兼容点击绑定
    function tap(el, fn) {
        if (!el) return;
        el.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); fn(e); }, {passive:false});
        el.addEventListener('click', function(e) { e.stopPropagation(); fn(e); });
    }

    function init() {
        var p = new URLSearchParams(location.search);
        if (p.get('reset')==='1') { localStorage.removeItem(SK); localStorage.removeItem(AK); localStorage.removeItem(CK); history.replaceState({},document.title,location.pathname); }
        loadStatus();
        checkShareVisit();
        observeCards();
        hookDisplay();
        // 绑定底部退款链接
        var rl = document.getElementById('refundLink');
        if (rl) tap(rl, function(){ showRefund(); });
    }

    function checkShareVisit() {
        var t = new URLSearchParams(location.search).get('share');
        if (t && t.startsWith('SH')) { fetch(API+'/share/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})}).catch(function(){}); history.replaceState({},document.title,location.pathname); }
    }

    function loadStatus() {
        try {
            aMethod = localStorage.getItem(AK)||'';
            if (aMethod && aMethod!=='share') { if (localStorage.getItem(SK)==='true') isPremium=true; }
            else { localStorage.removeItem(SK); localStorage.removeItem(AK); }
            var s = sessionStorage.getItem(SHK); shareCount = s?parseInt(s,10)||0:0;
            aCode = localStorage.getItem(CK)||'';
        } catch(e) { console.error(e); }
    }

    function saveStatus(persist) {
        try { if (persist) { localStorage.setItem(SK,isPremium?'true':'false'); localStorage.setItem(AK,aMethod); if (aCode) localStorage.setItem(CK,aCode); } sessionStorage.setItem(SHK,shareCount.toString()); } catch(e) {}
    }

    function activate(method, code) {
        isPremium=true; aMethod=method; if (code) aCode=code;
        saveStatus(method!=='share'); removeAll();
        toast(method==='share'?'🎉 分享解锁成功！':'🎉 解锁成功！');
    }

    function resetShare() { if (aMethod==='share') { isPremium=false; aMethod=''; sessionStorage.removeItem(SHK); shareCount=0; } }

    // 遮罩
    function applyAll() {
        if (isPremium) return;
        PREMIUM_CARDS.forEach(function(id) { var c=document.getElementById(id); if (c) applyOne(c); });
        showBanners();
    }

    // 顶部+底部醒目横幅
    function showBanners() {
        if (isPremium) { removeBanners(); return; }
        var rs = document.getElementById('resultSection'); if (!rs) return;
        // 顶部横幅
        if (!document.getElementById('premiumTopBanner')) {
            var top = document.createElement('div'); top.id='premiumTopBanner';
            top.style.cssText='background:linear-gradient(135deg,#4a1a8a,#6b21a8);color:#ffd700;padding:14px 20px;text-align:center;font-size:1.1em;font-weight:bold;cursor:pointer;border-radius:12px;margin:10px 0;display:flex;align-items:center;justify-content:center;gap:8px;';
            top.innerHTML='✨ 随喜即刻为您解锁全文十二大区域内容！ →';
            tap(top, function(){ showModal(PREMIUM_CARDS[0]); });
            rs.insertBefore(top, rs.firstChild);
        }
        // 底部横幅
        if (!document.getElementById('premiumBottomBanner')) {
            var bot = document.createElement('div'); bot.id='premiumBottomBanner';
            bot.style.cssText='background:linear-gradient(135deg,#4a1a8a,#6b21a8);color:#ffd700;padding:14px 20px;text-align:center;font-size:1.1em;font-weight:bold;cursor:pointer;border-radius:12px;margin:10px 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;';
            bot.innerHTML='<div>✨ 随喜即刻为您解锁全文十二大区域内容！ →</div><div style="font-size:0.75em;color:#ffd700;opacity:0.85;margin-top:6px;font-weight:normal;">如果您觉得分析不准或是对分析结果不满意，很乐意您与本人联系，定当给您全额退款！</div>';
            tap(bot, function(){ showModal(PREMIUM_CARDS[0]); });
            rs.appendChild(bot);
        }
    }

    function removeBanners() {
        var t=document.getElementById('premiumTopBanner'); if(t)t.remove();
        var b=document.getElementById('premiumBottomBanner'); if(b)b.remove();
    }

    function applyOne(card) {
        if (isPremium || card.dataset.hasPaywall==='true') return;
        card.dataset.hasPaywall='true';
        var ct = card.querySelector('.card-content');
        if (ct && ct.innerHTML.trim()) { saved.set(card.id, ct.innerHTML); ct.innerHTML=''; }
        var o = document.createElement('div'); o.className='paywall-overlay';
        o.innerHTML='<div class="paywall-icon">🔒</div><div class="paywall-text">付费内容</div><div class="paywall-hint">点击解锁查看完整分析</div>';
        tap(o, function() { showModal(card.id); });
        card.appendChild(o);
    }

    function removeAll() {
        document.querySelectorAll('.paywall-overlay').forEach(function(o){o.remove();});
        PREMIUM_CARDS.forEach(function(id) { var c=document.getElementById(id); if (c) { c.dataset.hasPaywall='false'; if (saved.has(id)) { var ct=c.querySelector('.card-content'); if (ct) ct.innerHTML=saved.get(id); } } });
        saved.clear();
        removeBanners();
    }

    function observeCards() {
        if (observer) observer.disconnect();
        observer = new MutationObserver(function(ms) {
            if (isPremium) return;
            ms.forEach(function(m) { m.addedNodes.forEach(function(n) { if (n.nodeType===1) { if (PREMIUM_CARDS.includes(n.id)) applyOne(n); if (n.querySelectorAll) n.querySelectorAll(PREMIUM_CARDS.map(function(id){return '#'+id;}).join(',')).forEach(applyOne); } }); });
        });
        var rs = document.getElementById('resultSection'); if (rs) observer.observe(rs,{childList:true,subtree:true});
    }

    function hookDisplay() {
        var orig = window.displayResults;
        window.displayResults = function(b) {
            resetShare(); removeAll();
            if (orig) orig.apply(this,arguments);
            setTimeout(function() { PREMIUM_CARDS.forEach(function(id){var c=document.getElementById(id);if(c)c.dataset.hasPaywall='';}); applyAll(); }, 500);
        };
    }

    // 支付弹窗
    function showModal(cardId) {
        var old = document.getElementById('paywallModal'); if (old) old.remove();
        lockedCard = cardId;
        var m = document.createElement('div'); m.id='paywallModal'; m.className='paywall-modal';
        m.innerHTML='<div class="paywall-modal-content"><div class="paywall-modal-header"><h2>解锁付费内容</h2><button class="paywall-modal-close" id="pwClose">&times;</button></div><div class="paywall-modal-body"><p class="paywall-modal-desc">✨ 随喜即刻为您解锁全文十二大区域内容！</p><div class="paywall-code-section" style="margin-bottom:15px;"><input type="text" id="codeInput" placeholder="已有激活码？直接输入" class="paywall-code-input"><button id="codeBtn" class="paywall-code-btn">激活</button></div><div class="paywall-divider"><span>或选择其他方式</span></div><div class="paywall-options"><div class="paywall-option paywall-option-share" id="shareBtn"><div class="option-icon">📱</div><div class="option-title">分享解锁</div><div class="option-desc">分享到2个微信群即可免费解锁本次分析</div><div class="option-status" id="shareStatus">'+(shareCount>=2?'✓ 已解锁':'已分享 '+shareCount+'/2 次')+'</div></div><div class="paywall-option paywall-option-188" id="pay188"><div class="option-icon">💰</div><div class="option-title">大众随喜 ¥188</div><div class="option-desc">全部分析解锁（永久有效）</div></div><div class="paywall-option paywall-option-388" id="pay388"><div class="option-icon">💎</div><div class="option-title">贵人随喜 ¥388</div><div class="option-desc">全部分析解锁 + 功德加倍（永久有效）</div></div></div><div class="paywall-error" id="pwError" style="display:none;"></div></div></div>';
        document.body.appendChild(m);
        tap(document.getElementById('pwClose'), closeModal);
        tap(document.getElementById('codeBtn'), doCode);
        tap(document.getElementById('shareBtn'), doShare);
        tap(document.getElementById('pay188'), function(){doPay(188);});
        tap(document.getElementById('pay388'), function(){doPay(388);});
        m.addEventListener('click',function(e){if(e.target===m)closeModal();});
        setTimeout(function(){m.classList.add('active');},10);
        document.addEventListener('keydown',escHandler);
    }

    function closeModal() { var m=document.getElementById('paywallModal'); if(m){m.classList.remove('active');setTimeout(function(){m.remove();},300);} document.removeEventListener('keydown',escHandler); lockedCard=null; }
    function escHandler(e){if(e.key==='Escape')closeModal();}

    // 分享
    function doShare() {
        if (shareCount>=2) { activate('share'); return; }
        loading('正在生成分享链接...');
        fetch(API+'/share/init',{method:'POST'}).then(function(r){return r.json();}).then(function(d){hideLoading();if(d.success&&d.token){shareToken=d.token;showSharePrompt(d.token);}else error('生成分享链接失败');}).catch(function(){hideLoading();error('网络错误');});
    }

    function showSharePrompt(token) {
        var url = 'https://bazifs.top?share='+token;
        var old = document.querySelector('.share-prompt'); if (old) old.remove();
        var p = document.createElement('div'); p.className='share-prompt';
        p.innerHTML='<div class="share-prompt-content"><div class="share-prompt-icon">📱</div><h3>分享到微信群</h3><p>将八字分析工具分享到 <strong>2个微信群</strong></p><p>有2个不同的人点开链接，即可解锁</p><div class="share-prompt-actions" style="flex-direction:column;gap:10px;"><button id="copyBtn" class="share-prompt-btn-confirm">📋 复制分享链接</button><button id="cardBtn" class="share-prompt-btn-confirm" style="background:#4a1a8a;">🖼️ 生成命理卡片（推荐）</button><p style="font-size:12px;color:#aaa;margin:5px 0;">💡 生成卡片后截图保存到相册，发给朋友扫码即可</p></div><div id="shareVisitStatus" style="text-align:center;margin-top:15px;font-size:14px;color:#ffd700;">当前访问: '+shareCount+'/2 人</div><p style="font-size:11px;color:#666;margin-top:10px;">⚠️ 分享解锁仅对本次分析有效，换八字需重新分享</p><div style="display:flex;gap:10px;margin-top:15px;"><button id="laterBtn" class="share-prompt-btn-cancel">稍后再说</button><button id="checkBtn" class="share-prompt-btn-confirm">查看分享结果 ✓</button></div></div>';
        document.body.appendChild(p);
        tap(document.getElementById('copyBtn'), function(){clipCopy('八字分析系统 - 命理解读 | 我能比你更了解你自己！ '+url,document.getElementById('copyBtn'));});
        tap(document.getElementById('cardBtn'), function(){genCard(url);});
        tap(document.getElementById('laterBtn'), closeSharePrompt);
        tap(document.getElementById('checkBtn'), checkShare);
        setTimeout(function(){p.classList.add('active');},10);
        startPoll(token);
    }

    function closeSharePrompt() { var p=document.querySelector('.share-prompt'); if(p){p.classList.remove('active');setTimeout(function(){p.remove();},300);} stopPoll(); }

    function startPoll(t) { stopPoll(); pollTimer=setInterval(function(){fetch(API+'/share/status?token='+encodeURIComponent(t)).then(function(r){return r.json();}).then(function(d){if(d.success){shareCount=d.visit_count;sessionStorage.setItem(SHK,shareCount.toString());var el=document.getElementById('shareVisitStatus');if(el){if(shareCount>=2){el.innerHTML='✅ 已有2人访问，解锁成功！';el.style.color='#4ecdc4';el.style.fontWeight='bold';}else el.textContent='当前访问: '+shareCount+'/2 人';}if(shareCount>=2){stopPoll();setTimeout(function(){closeSharePrompt();activate('share');},800);}}}).catch(function(){});},5000); }
    function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}

    function checkShare() {
        if (!shareToken){error('分享信息丢失');return;}
        loading('检查分享状态...');
        fetch(API+'/share/status?token='+encodeURIComponent(shareToken)).then(function(r){return r.json();}).then(function(d){hideLoading();if(d.success){shareCount=d.visit_count;sessionStorage.setItem(SHK,shareCount.toString());if(shareCount>=2){closeSharePrompt();activate('share');}else toast('已有'+shareCount+'人访问，还需'+(2-shareCount)+'人');}}).catch(function(){hideLoading();error('网络错误');});
    }

    function clipCopy(text,btn) {
        if (navigator.clipboard&&navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function(){btn.textContent='✅ 已复制！';setTimeout(function(){btn.textContent='📋 复制分享链接';},3000);}).catch(function(){fbCopy(text,btn);}); } else fbCopy(text,btn);
    }
    function fbCopy(text,btn) { var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;left:-9999px;top:-9999px;opacity:0;';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');btn.textContent='✅ 已复制！';setTimeout(function(){btn.textContent='📋 复制分享链接';},3000);}catch(e){btn.textContent='❌ 复制失败';}document.body.removeChild(ta); }

    function genCard(url) {
        window._shareOverrideUrl=url;
        // 先临时恢复plainLanguageCard内容，让shareBtn存在
        var plc=document.getElementById('plainLanguageCard');
        var plcContent=plc?plc.querySelector('.card-content'):null;
        var hadPaywall=(plc && plc.dataset.hasPaywall==='true');
        var savedHTML='';
        if (hadPaywall && plcContent && saved.has('plainLanguageCard')) {
            savedHTML=plcContent.innerHTML;
            plcContent.innerHTML=saved.get('plainLanguageCard');
        }
        var sm=document.getElementById('shareModal');if(sm){document.body.appendChild(sm);sm.style.zIndex='99999';}
        var pm=document.getElementById('paywallModal');if(pm)pm.remove();
        var sp=document.querySelector('.share-prompt');if(sp)sp.remove();
        stopPoll();lockedCard=null;
        if(typeof generateShareImage==='function'){
            generateShareImage();
            // 生成完恢复付费墙
            if(hadPaywall && plcContent && savedHTML!==undefined){
                setTimeout(function(){ plcContent.innerHTML=''; },100);
            }
        } else error('卡片生成不可用，请用复制链接');
    }

    // 支付
    function doPay(amount) {
        loading('正在创建订单...');
        fetch(API+'/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:amount})})
        .then(function(r){if(!r.ok)return r.json().then(function(d){throw new Error(d.error||'服务器错误');});return r.json();})
        .then(function(d){hideLoading();if(d.success&&(d.url||d.url_qrcode)){var mob=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);if(mob&&d.url){try{sessionStorage.setItem('bazi_payment_order',JSON.stringify(d));}catch(e){}location.href=d.url;}else showQR(d);}else error(d.error||'创建订单失败');})
        .catch(function(e){hideLoading();error('创建订单失败: '+(e.message||'网络错误'));});
    }

    function showQR(info) {
        var m=document.getElementById('paywallModal'), b=m?m.querySelector('.paywall-modal-body'):null; if(!b)return;
        window.currentPaymentOrder=info;
        var qr=info.url_qrcode||'', oid=info.order_id||info.orderId||'';
        b.innerHTML='<div class="qrcode-section"><div class="qrcode-header"><h3>微信支付</h3><p>截图保存，打开微信扫一扫从相册识别</p></div><div class="qrcode-amount">¥'+(info.amount||'')+'</div>'+(qr?'<div class="qrcode-box"><img src="'+qr+'" alt="支付二维码" style="width:100%;height:auto;max-width:160px;"></div>':'<div class="qrcode-box"><div class="qrcode-placeholder"><div class="qrcode-icon">📱</div><p>支付二维码</p></div></div>')+'<div class="qrcode-tip"><p>💡 支付完成后点击"已完成支付"按钮</p></div><div class="qrcode-actions"><button id="payOkBtn" class="qrcode-btn-cancel">已完成支付 ✓</button><button id="payBackBtn" class="qrcode-btn-back">返回</button></div><p style="font-size:11px;color:#666;margin-top:10px;">订单号: '+oid+'</p></div>';
        tap(document.getElementById('payOkBtn'), checkPay);
        tap(document.getElementById('payBackBtn'), closeModal);
    }

    function checkPay() {
        var o=window.currentPaymentOrder;if(!o){error('订单信息丢失');return;}
        loading('正在验证支付状态...');
        fetch(API+'/status?order_id='+encodeURIComponent(o.order_id||o.orderId||'')).then(function(r){return r.json();}).then(function(d){hideLoading();if(d.status==='paid')activate(o.amount===388?'pay388':'pay188',d.activation_code||'');else error('未检测到支付，请完成支付后再试');}).catch(function(){hideLoading();error('网络错误');});
    }

    // 激活码
    function doCode() {
        var inp=document.getElementById('codeInput'), code=inp?inp.value.trim().toUpperCase():'';
        if (!code){error('请输入激活码');return;}
        loading('验证激活码...');
        fetch(API+'/verify-code?code='+encodeURIComponent(code)).then(function(r){return r.json();}).then(function(d){hideLoading();if(d.valid)activate('code',code);else error(d.message||'激活码无效或已过期');}).catch(function(){hideLoading();error('验证失败');});
    }

    // UI
    function toast(msg,dur) { dur=dur||2000; var t=document.createElement('div');t.className='paywall-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.classList.add('active');},10);setTimeout(function(){t.classList.remove('active');setTimeout(function(){t.remove();},300);},dur); }
    function loading(msg) { hideLoading(); var l=document.createElement('div');l.className='paywall-loading';l.id='paywallLoading';l.innerHTML='<div class="loading-spinner"></div><p>'+msg+'</p>';document.body.appendChild(l); }
    function hideLoading(){var l=document.getElementById('paywallLoading');if(l)l.remove();}
    function error(msg){var e=document.getElementById('pwError');if(e){e.textContent=msg;e.style.display='block';setTimeout(function(){e.style.display='none';},3000);}else toast(msg,3000);}

    // 退款
    function showRefund() {
        var old=document.getElementById('refundModal');if(old)old.remove();
        var m=document.createElement('div');m.id='refundModal';
        m.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';
        var now=new Date();var ts=now.getFullYear()+'-'+(now.getMonth()+1).toString().padStart(2,'0')+'-'+now.getDate().toString().padStart(2,'0')+' '+now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
        m.innerHTML='<div style="background:#1a1a2e;border-radius:16px;padding:25px;max-width:400px;width:100%;color:#fff;"><h3 style="margin:0 0 15px;">📋 申请退款（全额退还）</h3><select id="rAmount" style="width:100%;padding:10px;margin-bottom:10px;background:#2a2a3e;border:1px solid #444;border-radius:8px;color:#fff;box-sizing:border-box;"><option value="">请选择您支付的档位 *</option><option value="188">大众随喜 ¥188 → 全额退¥188</option><option value="388">贵人随喜 ¥388 → 全额退¥388</option></select><input id="rOrderId" placeholder="订单号（选填，可在支付记录中查看）" style="width:100%;padding:10px;margin-bottom:10px;background:#2a2a3e;border:1px solid #444;border-radius:8px;color:#fff;box-sizing:border-box;"><div style="padding:10px;margin-bottom:10px;background:#2a2a3e;border:1px solid #444;border-radius:8px;color:#888;font-size:0.9em;">申请时间：'+ts+'</div><textarea id="rReason" placeholder="退款原因 *" style="width:100%;padding:10px;margin-bottom:10px;background:#2a2a3e;border:1px solid #444;border-radius:8px;color:#fff;min-height:60px;box-sizing:border-box;"></textarea><input id="rContact" placeholder="联系方式 *（微信号或手机号）" style="width:100%;padding:10px;margin-bottom:15px;background:#2a2a3e;border:1px solid #444;border-radius:8px;color:#fff;box-sizing:border-box;"><button id="rSubmitBtn" style="width:100%;padding:12px;background:linear-gradient(135deg,#4a1a8a,#6b21a8);color:#ffd700;border:none;border-radius:8px;font-size:16px;cursor:pointer;">提交退款申请</button><p style="font-size:11px;color:#666;margin-top:8px;text-align:center;">提交后将在24小时内全额退还至原支付账户</p></div>';
        document.body.appendChild(m);
        tap(document.getElementById('rSubmitBtn'), function(){
            var oid=document.getElementById('rOrderId').value.trim(), reason=document.getElementById('rReason').value.trim(), contact=document.getElementById('rContact').value.trim(), amount=document.getElementById('rAmount').value.trim();
            if(!amount){toast('请填写退款金额');return;}if(!reason){toast('请填写退款原因');return;}if(!contact){toast('请填写联系方式');return;}
            fetch(API+'/refund/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:oid,amount:amount,reason:reason,contact:contact,apply_time:ts})}).then(function(r){return r.json();}).then(function(d){if(d.success){toast('✅ 退款申请已提交');closeRefund();}else toast(d.error||'提交失败');}).catch(function(){toast('网络错误');});
        });
        m.addEventListener('click',function(e){if(e.target===m)m.remove();});
    }
    function closeRefund(){var m=document.getElementById('refundModal');if(m)m.remove();}

    // 全局暴露
    window.closePaywallModal = closeModal;
    window.closeSharePrompt = closeSharePrompt;
    window.checkShareStatus = checkShare;
    window.checkPaymentStatus = checkPay;
    window._showRefundModal = showRefund;
    window.PaywallSystem = {init:init,isActivated:function(){return isPremium;},activate:activate,showModal:showModal,closeModal:closeModal};

    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
