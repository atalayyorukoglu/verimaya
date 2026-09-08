import SwiftUI

/*
 `apps/web/src/lib/components/StatusBadge.svelte` karşılığı.

 Web sınıfı: `rounded-[6px] border px-2 py-0.5 text-xs font-medium`
 Tonlar: neutral / brand / success / warning / danger / info — zemin `/15`
 opaklıkta, kenarlık neutral dışında saydam.
*/
enum BadgeTone {
    case neutral, brand, success, warning, danger, info
}

struct StatusBadge: View {
    @Environment(\.palette) private var c

    let label: String
    var tone: BadgeTone = .neutral

    var body: some View {
        Text(label)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                    .stroke(border, lineWidth: 1)
            )
            .lineLimit(1)
    }

    private var foreground: Color {
        switch tone {
        case .neutral: return c.textMuted
        case .brand: return c.brandText
        case .success: return c.success
        case .warning: return c.warning
        case .danger: return c.danger
        case .info: return c.info
        }
    }

    private var background: Color {
        switch tone {
        case .neutral: return c.surface2
        case .brand: return c.brandSubtle
        case .success: return c.success.opacity(0.15)
        case .warning: return c.warning.opacity(0.15)
        case .danger: return c.danger.opacity(0.15)
        case .info: return c.info.opacity(0.15)
        }
    }

    private var border: Color {
        tone == .neutral ? c.border : .clear
    }
}

/// `apps/web/src/lib/status-tone.ts` — işlem durumu → ton.
func transactionStatusTone(_ status: TransactionStatus) -> BadgeTone {
    switch status {
    case .paid: return .success
    case .partial: return .warning
    case .unpaid: return .danger
    }
}

/// `contactStatusTone`.
func contactStatusTone(_ status: ContactStatus) -> BadgeTone {
    switch status {
    case .treated: return .success
    case .cancelled: return .danger
    case .scheduled, .arrived: return .brand
    case .follow_up: return .info
    }
}

/// `appointmentStatusTone`.
func appointmentStatusTone(_ status: AppointmentStatus) -> BadgeTone {
    switch status {
    case .completed: return .success
    case .cancelled, .no_show: return .danger
    case .confirmed, .in_progress: return .brand
    case .scheduled: return .neutral
    }
}
