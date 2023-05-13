// Espere hasta que el navegador esté listo para renderizar el juego (evita fallos)
window.requestAnimationFrame(function () {
  new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
});
