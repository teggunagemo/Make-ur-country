// ログインボタンが押されたときの処理
async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // ログイン完了後に戻ってくるページのURL（任意）
      redirectTo: 'https://teggunagemo.github.io/Make-ur-country'
    }
  })
}
