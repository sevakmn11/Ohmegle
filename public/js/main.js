const $ = (x) => document.querySelector(x)

function configureTopbar() {
  const $logo = $('#logo')
  $logo.addEventListener('click', () => {
    window.location.href = '/'
  })
}

configureTopbar()
