mixins.crypto={data(){return{crypto:"",check:!1}},methods:{SHA(t){return CryptoJS.SHA256(t).toString()},decrypt(t,r,e){try{var c=CryptoJS.AES.decrypt(t,r).toString(CryptoJS.enc.Utf8);return{check:this.SHA(c)===e,decrypted:c}}catch{return{check:!1}}}},watch:{crypto(t){var r=this.$refs.crypto,e=this.$refs.content,{decrypted:t,check:c}=this.decrypt(r.dataset.encrypted,t,r.dataset.shasum);(this.check=c)?(r.classList.remove("fail"),r.classList.add("success"),r.disabled=!0,e.innerHTML=t,this.render()):r.classList.add("fail")}}},mixins.push(cryptoMixin);