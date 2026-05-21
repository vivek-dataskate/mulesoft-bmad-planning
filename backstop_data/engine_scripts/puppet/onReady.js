// Injected after page load — kills all CSS transitions and animations for
// stable, deterministic screenshots (no mid-animation frame captures).
module.exports = async (page, scenario, vp) => {
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important;animation:none!important;animation-duration:0s!important}',
  });
};
