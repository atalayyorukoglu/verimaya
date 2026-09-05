import SwiftUI

/// "AI işlem" sekmesi — WhatsApp'tan gelen mesajlar ve onay kuyruğu.
struct InboxView: View {
  @StateObject private var vm = InboxViewModel()

  var body: some View {
    ZStack {
      VerimayaTheme.bg.ignoresSafeArea()

      VStack(spacing: 0) {
        if let message = vm.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(VerimayaTheme.info)
        }

        if vm.messages.isEmpty && !vm.isLoading {
          ContentUnavailableView(
            "Bekleyen mesaj yok",
            systemImage: "message",
            description: Text("WhatsApp'tan mesaj geldiğinde burada görünür.")
          )
        } else {
          List {
            ForEach(vm.messages) { item in
              InboxRow(
                message: item,
                siblingCount: vm.groupSiblings(of: item).count,
                isParsing: vm.isParsing,
                onAnalyze: { Task { await vm.analyze(item) } },
                onIgnore: { Task { await vm.ignore(item.id) } }
              )
              .listRowBackground(VerimayaTheme.surface)
            }

            if vm.hasMore {
              HStack {
                Spacer()
                ProgressView()
                Spacer()
              }
              .listRowBackground(VerimayaTheme.bg)
              .onAppear { Task { await vm.loadMore() } }
            }
          }
          .listStyle(.plain)
          .scrollContentBackground(.hidden)
          .refreshable { await vm.refresh() }
        }
      }
    }
    .navigationTitle("AI işlem")
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          Task { await vm.processNew() }
        } label: {
          if vm.isProcessing {
            ProgressView()
          } else {
            Image(systemName: "sparkles")
          }
        }
        .disabled(vm.isProcessing)
        .accessibilityLabel("Yeni mesajları işle")
      }
    }
    .sheet(item: $vm.activeMessage) { message in
      DraftApprovalView(
        message: message,
        drafts: vm.drafts,
        siblings: vm.groupSiblings(of: message),
        vm: vm
      )
    }
    .task { await vm.load(reset: true) }
  }
}

/// Tek mesaj satırı. Aynı olay uyarısı burada görünür (AI-13).
struct InboxRow: View {
  let message: InboundMessage
  let siblingCount: Int
  let isParsing: Bool
  let onAnalyze: () -> Void
  let onIgnore: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Text(message.chatName ?? message.sender ?? "Bilinmeyen sohbet")
          .font(.caption)
          .foregroundStyle(VerimayaTheme.textFaint)
          .lineLimit(1)

        StatusChip(text: message.status.label, color: message.status == .new ? VerimayaTheme.warning : VerimayaTheme.info)

        if message.hasMedia {
          StatusChip(text: "Medya", color: VerimayaTheme.textMuted)
        }

        Spacer()

        Text(DateFmt.dateTime(message.createdAt))
          .font(.caption2)
          .foregroundStyle(VerimayaTheme.textFaint)
      }

      Text(message.body?.isEmpty == false ? message.body! : "(boş mesaj)")
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.text)
        .lineLimit(3)

      if siblingCount > 0 {
        Label(
          "Aynı olay olabilir — bu tutar aynı sohbetteki \(siblingCount) mesajda daha geçiyor. İkisini de onaylarsan aynı kayıt iki kez oluşur.",
          systemImage: "exclamationmark.triangle"
        )
        .font(.caption)
        .foregroundStyle(VerimayaTheme.warning)
      }

      if let parseError = message.parseError {
        Text(parseError)
          .font(.caption)
          .foregroundStyle(VerimayaTheme.danger)
      }

      HStack(spacing: 10) {
        Button("Analiz et", action: onAnalyze)
          .buttonStyle(.borderedProminent)
          .tint(VerimayaTheme.brand)
          .controlSize(.small)
          .disabled(isParsing)

        // Marka rengi TabView'dan miras kaliyor; ikincil eylem okunmuyordu.
        Button("Yoksay", action: onIgnore)
          .buttonStyle(.bordered)
          .tint(VerimayaTheme.textMuted)
          .controlSize(.small)
      }
    }
    .padding(.vertical, 6)
  }
}

struct StatusChip: View {
  let text: String
  let color: Color

  var body: some View {
    Text(text)
      .font(.caption2.weight(.medium))
      .foregroundStyle(color)
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(color.opacity(0.14))
      .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
  }
}
