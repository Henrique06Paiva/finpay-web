/**
 * Serviço de Feedback Háptico para iPhone e dispositivos móveis (Web Haptics API)
 *
 * No iOS Safari e PWA Standalone, navigator.vibrate fornece pulsos táteis leves
 * que aumentam o polimento sensorial do aplicativo ao digitar o PIN, desbloquear
 * com Face ID, adicionar lançamentos ou excluir registros.
 */

type HapticFeedbackType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error';

class HapticService {
  private hasVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  trigger(type: HapticFeedbackType = 'light') {
    if (!this.hasVibration) return;

    try {
      switch (type) {
        case 'selection':
          // Toque suave (ex: trocar de aba, selecionar botão)
          navigator.vibrate(8);
          break;

        case 'light':
          // Pulso leve padrão (ex: digitação de dígitos no teclado de PIN)
          navigator.vibrate(12);
          break;

        case 'medium':
          // Toque intermediário (ex: abrir modal, alternar switch)
          navigator.vibrate(24);
          break;

        case 'heavy':
          // Toque pronunciado (ex: confirmação de lançamento, pagamento de conta)
          navigator.vibrate(40);
          break;

        case 'success':
          // Padrão de sucesso duplo (ex: Face ID autenticado, backup restaurado)
          navigator.vibrate([15, 60, 25]);
          break;

        case 'warning':
          // Pulso de advertência (ex: atingiu 80% do orçamento)
          navigator.vibrate([30, 80, 30]);
          break;

        case 'error':
          // Padrão de erro triplo (ex: PIN incorreto, falha biométrica)
          navigator.vibrate([40, 50, 40, 50, 60]);
          break;

        default:
          navigator.vibrate(12);
      }
    } catch {
      // Ignora silenciosamente se o dispositivo estiver em modo não perturbe
    }
  }

  // Atalhos de conveniência
  tap() {
    this.trigger('light');
  }

  selection() {
    this.trigger('selection');
  }

  success() {
    this.trigger('success');
  }

  error() {
    this.trigger('error');
  }
}

export const haptic = new HapticService();
